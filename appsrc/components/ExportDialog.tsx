import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  CONTAINER_EXT,
  EXPORT_FPS_OPTIONS,
  EXPORT_SCALE_OPTIONS,
  probeCodecSupport,
  runExport,
  saveResult,
  ExportCancelledError,
} from '../exporter';
import type { ExportContainer, ExportVideoCodec } from '../exporter';
import { timelineDuration, useProjectStore } from '../state/projectStore';
import { useUiStore } from '../state/uiStore';
import { useT, type DictKey } from '../i18n';
import { Select, Switch } from './controls';

const VIDEO_CONTAINERS: ExportContainer[] = ['mp4', 'mov', 'webm', 'mkv'];
const CONVERT_CONTAINERS: ExportContainer[] = ['gif', 'avi', 'flv', 'wmv', 'mpegts'];
const AUDIO_CONTAINERS: ExportContainer[] = ['mp3', 'wav', 'ogg', 'flac', 'm4a'];
const CODECS: ExportVideoCodec[] = ['avc', 'hevc', 'vp9', 'av1'];

/** Konteyner başına izinlenen video kodekleri (mediabunny kısıtları). */
const CODECS_PER_CONTAINER: Partial<Record<ExportContainer, ExportVideoCodec[]>> = {
  mp4: ['avc', 'hevc', 'vp9', 'av1'],
  mov: ['avc', 'hevc', 'vp9', 'av1'],
  webm: ['vp9', 'av1'],
  mkv: ['avc', 'hevc', 'vp9', 'av1'],
};

function codecsFor(container: ExportContainer): ExportVideoCodec[] {
  return CODECS_PER_CONTAINER[container] ?? CODECS;
}

export function ExportDialog() {
  const t = useT();
  const setExportOpen = useUiStore((s) => s.setExportOpen);
  const settings = useProjectStore((s) => s.settings);
  const clips = useProjectStore((s) => s.clips);
  const [container, setContainer] = useState<ExportContainer>('mp4');
  const [videoCodec, setVideoCodec] = useState<ExportVideoCodec>('avc');
  const [quality, setQuality] = useState<'low' | 'medium' | 'high' | 'veryhigh'>('high');
  const [scale, setScale] = useState<number>(1);
  const [fps, setFps] = useState<number>(settings.fps);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [fileName, setFileName] = useState(settings.name || 'export');
  const [support, setSupport] = useState<Awaited<ReturnType<typeof probeCodecSupport>> | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const cancelRef = useRef({ cancelled: false });

  const duration = timelineDuration(clips);
  const isAudioOnly = AUDIO_CONTAINERS.includes(container);
  const isConvert = CONVERT_CONTAINERS.includes(container);
  const containerLabel = (c: ExportContainer): string => t(`export.container.${c}` as DictKey);

  useEffect(() => {
    void probeCodecSupport(settings.width, settings.height).then(setSupport);
  }, [settings.width, settings.height]);

  // Kodek her zaman formatla uyumlu VE tarayıcıda desteklenen olmalı —
  // değilse otomatik ilk geçerli kodeğe düş (ör. WebM'de H.264 seçilemez)
  useEffect(() => {
    const allowed = codecsFor(container);
    const ok = allowed.includes(videoCodec) && (!support || support.video[videoCodec]);
    if (!ok) {
      const first = allowed.find((c) => !support || support.video[c]);
      setVideoCodec(first ?? allowed[0]);
    }
  }, [container, support, videoCodec]);

  const outW = Math.round((settings.width * scale) / 2) * 2;
  const outH = Math.round((settings.height * scale) / 2) * 2;
  const effFps = container === 'gif' ? Math.min(fps, 15) : fps;
  const estFrames = Math.ceil(duration * effFps);

  const start = async () => {
    setError('');
    setDone(false);
    setRunning(true);
    setProgress(0);
    cancelRef.current = { cancelled: false };
    try {
      const result = await runExport({
        container,
        videoCodec,
        quality,
        scale,
        fps,
        includeAudio,
        fileName,
        onProgress: (p: number, s: string) => {
          setProgress(p);
          setStage(s);
        },
        cancelRef: cancelRef.current,
      });
      const how = await saveResult(result.blob, result.fileName);
      setDone(how !== 'cancelled');
      setStage(t('export.saved'));
    } catch (e) {
      if (e instanceof ExportCancelledError) {
        setStage(t('export.cancelled'));
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setRunning(false);
    }
  };

  const close = () => {
    if (running) {
      cancelRef.current.cancelled = true;
    }
    setExportOpen(false);
  };

  const chip = (c: ExportContainer, sub: string) => (
    <button
      key={c}
      className={`container-chip ${container === c ? 'active' : ''}`}
      onClick={() => setContainer(c)}
    >
      <span className="chip-name">{containerLabel(c).toUpperCase()}</span>
      <span className="chip-sub">{sub}</span>
    </button>
  );

  return (
    <div className="dialog-overlay" onPointerDown={(e) => { if (e.target === e.currentTarget && !running) close(); }}>
      <div className="dialog export-dialog" role="dialog" aria-modal="true" aria-label={t('export.title')}>
        <div className="dialog-title-row">
          <span className="dialog-title">{t('export.title')}</span>
          {!running && (
            <button className="icon-btn" onClick={close} aria-label={t('settings.cancel')}>
              <X size={15} />
            </button>
          )}
        </div>

        {!running && !done && (
          <>
            <div className="field">
              <label>{t('export.container')}</label>
              <div className="container-grid">
                {VIDEO_CONTAINERS.map((c) => chip(c, t('export.groupVideo')))}
                {CONVERT_CONTAINERS.map((c) => chip(c, t('export.groupVideoConvert')))}
                {AUDIO_CONTAINERS.map((c) => chip(c, t('export.groupAudio')))}
              </div>
            </div>

            {!isAudioOnly && !isConvert && (
              <div className="field">
                <label>{t('export.codec')}</label>
                <div className="container-grid codec-grid">
                  {CODECS.map((c) => {
                    const ok = support ? support.video[c] : true;
                    const inContainer = codecsFor(container).includes(c);
                    return (
                      <button
                        key={c}
                        className={`container-chip small ${videoCodec === c ? 'active' : ''}`}
                        disabled={!ok || !inContainer}
                        title={
                          !inContainer
                            ? t('export.codecNotInContainer')
                            : ok
                              ? c === 'hevc'
                                ? t('export.hevcHint')
                                : c.toUpperCase()
                              : t('export.codecUnsupported')
                        }
                        onClick={() => setVideoCodec(c)}
                      >
                        {c === 'avc' ? 'H.264' : c === 'hevc' ? 'H.265' : c.toUpperCase()}
                        {!ok && inContainer && <span className="chip-sub">{t('export.unsupported')}</span>}
                      </button>
                    );
                  })}
                </div>
                {videoCodec === 'hevc' && support && !support.video.hevc && (
                  <div className="dialog-error">{t('export.hevcHint')}</div>
                )}
              </div>
            )}

            <div className="field">
              <label>{t('export.fileName')}</label>
              <div className="filename-row">
                <input className="input" value={fileName} spellCheck={false} onChange={(e) => setFileName(e.target.value)} />
                <span className="filename-ext">.{CONTAINER_EXT[container]}</span>
              </div>
            </div>

            {!isAudioOnly && (
              <div className="export-twin">
                <div className="field">
                  <label>{t('export.resolution')}</label>
                  <Select
                    value={scale}
                    options={EXPORT_SCALE_OPTIONS.map((s) => ({
                      value: s,
                      label: `${Math.round((settings.width * s) / 2) * 2}×${Math.round((settings.height * s) / 2) * 2} (${Math.round(s * 100)}%)`,
                    }))}
                    onChange={setScale}
                  />
                </div>
                <div className="field">
                  <label>{t('export.fps')}</label>
                  <Select
                    value={fps}
                    options={EXPORT_FPS_OPTIONS.map((f) => ({ value: f, label: String(f) }))}
                    onChange={setFps}
                  />
                </div>
              </div>
            )}

            <div className="export-twin">
              {!isAudioOnly && !isConvert && (
                <div className="field">
                  <label>{t('export.quality')}</label>
                  <Select
                    value={quality}
                    options={[
                      { value: 'low' as const, label: t('export.qualityLow') },
                      { value: 'medium' as const, label: t('export.qualityMedium') },
                      { value: 'high' as const, label: t('export.qualityHigh') },
                      { value: 'veryhigh' as const, label: t('export.qualityVeryHigh') },
                    ]}
                    onChange={(q) => setQuality(q)}
                  />
                </div>
              )}
              {container !== 'gif' && (
                <div className="field">
                  <label>{t('export.audio')}</label>
                  <label className="check-row">
                    <Switch checked={includeAudio} onChange={setIncludeAudio} />
                    {t('export.includeAudio')}
                  </label>
                </div>
              )}
            </div>

            <div className="export-summary">
              {t('export.summary')
                .replace('{res}', `${outW}×${outH}`)
                .replace('{fps}', String(effFps))
                .replace('{frames}', String(estFrames))
                .replace('{dur}', duration.toFixed(1))}
            </div>

            {error && <div className="dialog-error">{error}</div>}
            <div className="dialog-actions">
              <button className="btn" onClick={close}>
                {t('settings.cancel')}
              </button>
              <button className="btn accent" onClick={start} disabled={clips.length === 0}>
                {t('export.start')}
              </button>
            </div>
          </>
        )}

        {(running || done) && (
          <div className="export-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <div className="progress-stage">
              {stage} {progress > 0 && progress < 1 ? `— ${Math.round(progress * 100)}%` : ''}
            </div>
            {error && <div className="dialog-error">{error}</div>}
            <div className="dialog-actions">
              {running ? (
                <button className="btn" onClick={() => { cancelRef.current.cancelled = true; }}>
                  {t('export.cancelRun')}
                </button>
              ) : (
                <button className="btn accent" onClick={close}>
                  {t('export.done')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
