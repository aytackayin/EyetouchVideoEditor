import { useEffect, useRef, useState } from 'react';
import { ChevronsUpDown, ChevronLeft, ChevronRight, Frame, Pause, Play, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from 'lucide-react';
import { useProjectStore, timelineDuration } from '../state/projectStore';
import { useUiStore } from '../state/uiStore';
import { useT } from '../i18n';
import { timecode } from '../utils';
import { renderer } from '../engine/renderer';
import { playback } from '../engine/playback';
import { TransformOverlay, isOverlayActive, pickPreviewClip } from './TransformOverlay';
import { useMediaStore } from '../state/mediaStore';

const STAGE_PADDING = 22;

export function PreviewPanel() {
  const t = useT();
  const settings = useProjectStore((s) => s.settings);
  const setSettings = useProjectStore((s) => s.setSettings);
  const { width, height, fps } = settings;
  const clips = useProjectStore((s) => s.clips);
  const tracks = useProjectStore((s) => s.tracks);
  const assets = useMediaStore((s) => s.assets);
  const currentTime = useProjectStore((s) => s.currentTime);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const masterVolume = useUiStore((s) => s.masterVolume);
  const setMasterVolume = useUiStore((s) => s.setMasterVolume);
  const selectedClipIds = useUiStore((s) => s.selectedClipIds);
  const selectClip = useUiStore((s) => s.selectClip);

  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    if (canvasRef.current) {
      renderer.attach(canvasRef.current);
      renderer.setSize(width, height);
      playback.markDirty();
    }
  }, [width, height]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const recompute = () => {
      const availW = el.clientWidth - STAGE_PADDING * 2;
      const availH = el.clientHeight - STAGE_PADDING * 2;
      if (availW <= 0 || availH <= 0) return;
      const ratio = width / height;
      let w = availW;
      let h = availW / ratio;
      if (h > availH) {
        h = availH;
        w = availH * ratio;
      }
      setFrameSize((prev) =>
        prev && prev.w === Math.floor(w) && prev.h === Math.floor(h) ? prev : { w: Math.floor(w), h: Math.floor(h) },
      );
    };
    recompute();
    // İlk mount'ta layout geç gelebilir; RO bazı gömülü webview'lerde hiç
    // tetiklenmeyebilir — rAF/zamanlayıcı ile tekrar ölç, pencere resize'ında da
    const raf = requestAnimationFrame(recompute);
    const t1 = window.setTimeout(recompute, 80);
    const t2 = window.setTimeout(recompute, 350);
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    window.addEventListener('resize', recompute);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      ro.disconnect();
      window.removeEventListener('resize', recompute);
    };
  }, [width, height]);

  const totalDuration = timelineDuration(clips);

  /**
   * Boş alana/klipe tıklama: altındaki klibi seçer, boşsa seçimi bırakır.
   * Dönüşüm çerçevesi ve canvas kulpları kendi olaylarını durdurur.
   */
  const onFramePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !frameSize) return;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    const k = frameSize.w / settings.width;
    const cx = (e.clientX - rect.left) / k;
    const cy = (e.clientY - rect.top) / (frameSize.h / settings.height);
    const hit = pickPreviewClip(clips, tracks, assets, settings, currentTime, cx, cy);
    selectClip(hit, e.ctrlKey || e.metaKey || e.shiftKey);
  };

  // Klip çerçevesi görünürken canvas boyut kulpları gizlenir (çakışma olmasın)
  const overlayActive = isOverlayActive(selectedClipIds, clips, tracks, currentTime, isPlaying);

  return (
    <section className="panel" aria-label={t('preview.title')}>
      <div className="panel-header">
        <span className="panel-title">{t('preview.title')}</span>
        <div className="spacer" />
        <button className="btn slim" title={t('preview.canvasSize')} onClick={() => selectClip(null)}>
          <Frame size={13} />
          {width}×{height} · {fps} fps
          <ChevronsUpDown size={12} />
        </button>
      </div>
      <div className="preview-stage" ref={stageRef}>
        <div
          className="preview-frame"
          ref={frameRef}
          style={frameSize ? { width: frameSize.w, height: frameSize.h } : undefined}
          onPointerDown={onFramePointerDown}
        >
          <canvas ref={canvasRef} width={width} height={height} style={{ width: '100%', height: '100%' }} />
          {clips.length === 0 && <div className="preview-hint">{t('preview.empty')}</div>}
          <TransformOverlay frameSize={frameSize} settings={settings} />
          {!overlayActive && <CanvasResizeHandles frameSize={frameSize} settings={settings} setSettings={setSettings} />}
        </div>
      </div>
      <div className="transport">
        <button className="icon-btn" title={t('preview.start')} aria-label={t('preview.start')} onClick={() => playback.seek(0)}>
          <SkipBack size={16} />
        </button>
        <button className="icon-btn" title={t('preview.prevFrame')} aria-label={t('preview.prevFrame')} onClick={() => playback.stepFrames(-1)}>
          <ChevronLeft size={16} />
        </button>
        <button
          className="icon-btn primary"
          title={isPlaying ? t('preview.pause') : t('preview.play')}
          aria-label={isPlaying ? t('preview.pause') : t('preview.play')}
          onClick={() => playback.toggle()}
        >
          {isPlaying ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <button className="icon-btn" title={t('preview.nextFrame')} aria-label={t('preview.nextFrame')} onClick={() => playback.stepFrames(1)}>
          <ChevronRight size={16} />
        </button>
        <button className="icon-btn" title={t('preview.end')} aria-label={t('preview.end')} onClick={() => playback.seek(totalDuration)}>
          <SkipForward size={16} />
        </button>
        <span className="time">
          {timecode(currentTime, fps)}
          <span className="time-total"> / {timecode(totalDuration, fps)}</span>
        </span>
        <div className="spacer" />
        <span className="master-volume">
          {masterVolume <= 0 ? <VolumeX size={14} /> : masterVolume < 0.5 ? <Volume1 size={14} /> : <Volume2 size={14} />}
          <input
            type="range"
            className="slider mini"
            min={0}
            max={1}
            step={0.01}
            value={masterVolume}
            title={t('preview.masterVolume')}
            aria-label={t('preview.masterVolume')}
            onChange={(e) => setMasterVolume(Number(e.target.value))}
          />
        </span>
      </div>
    </section>
  );
}

/**
 * Canvas'ı fareyle yeniden boyutlandırma: çerçevenin kenar/köşe tutamaçlarından
 * sürükleyerek proje çözünürlüğü (W×H) doğrudan değişir.
 * Yalnızca hiçbir klip çerçevesi görünmezken çizilir (çakışma yok).
 * Shift + köşe: en-boy oranını koru.
 */
const CR_MIN = 16;
const CR_MAX = 7680;

function CanvasResizeHandles({
  frameSize,
  settings,
  setSettings,
}: {
  frameSize: { w: number; h: number } | null;
  settings: ProjectSettings;
  setSettings: (patch: Partial<ProjectSettings>) => void;
}) {
  if (!frameSize) return null;
  const scale = frameSize.w / settings.width;

  const onDown = (e: React.PointerEvent, dx1: number, dy1: number) => {
    e.stopPropagation();
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, w: settings.width, h: settings.height };
    const clamp = (v: number) => Math.max(CR_MIN, Math.min(CR_MAX, Math.round(v / 2) * 2));
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / scale;
      const dy = (ev.clientY - start.y) / scale;
      let w = start.w;
      let h = start.h;
      if (dx1 === 1) w = start.w + dx;
      if (dx1 === -1) w = start.w - dx;
      if (dy1 === 1) h = start.h + dy;
      if (dy1 === -1) h = start.h - dy;
      if (ev.shiftKey && dx1 !== 0 && dy1 !== 0) {
        h = w * (start.h / start.w);
      }
      setSettings({ width: clamp(w), height: clamp(h) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const H = 16; // kulp boyutu
  const handles: Array<{ id: string; dx: number; dy: number; style: React.CSSProperties }> = [
    { id: 'n', dx: 0, dy: -1, style: { top: -5, left: '50%', marginLeft: -H * 1.5, width: H * 3, height: 7, cursor: 'ns-resize' } },
    { id: 's', dx: 0, dy: 1, style: { bottom: -5, left: '50%', marginLeft: -H * 1.5, width: H * 3, height: 7, cursor: 'ns-resize' } },
    { id: 'w', dx: -1, dy: 0, style: { left: -5, top: '50%', marginTop: -H * 1.5, width: 7, height: H * 3, cursor: 'ew-resize' } },
    { id: 'e', dx: 1, dy: 0, style: { right: -5, top: '50%', marginTop: -H * 1.5, width: 7, height: H * 3, cursor: 'ew-resize' } },
    { id: 'nw', dx: -1, dy: -1, style: { left: -5, top: -5, width: H, height: H, cursor: 'nwse-resize' } },
    { id: 'ne', dx: 1, dy: -1, style: { right: -5, top: -5, width: H, height: H, cursor: 'nesw-resize' } },
    { id: 'sw', dx: -1, dy: 1, style: { left: -5, bottom: -5, width: H, height: H, cursor: 'nesw-resize' } },
    { id: 'se', dx: 1, dy: 1, style: { right: -5, bottom: -5, width: H, height: H, cursor: 'nwse-resize' } },
  ];

  return (
    <>
      {handles.map((h) => (
        <div key={h.id} className="cr-handle" style={h.style} onPointerDown={(e) => onDown(e, h.dx, h.dy)} title="Sürükle: canvas boyutu · Shift: oranını koru" />
      ))}
    </>
  );
}
