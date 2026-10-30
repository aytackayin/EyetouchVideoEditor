import { useEffect, useRef, useState } from 'react';
import {
  Bold,
  Diamond,
  Italic,
  MousePointerClick,
  Repeat,
  Rewind,
  RotateCcw,
  Snowflake,
  Split,
  Type as TypeIcon,
  Upload,
} from 'lucide-react';
import type {
  ChromaKey,
  ClipMask,
  ClipTransform,
  ColorEffects,
  CropEdges,
  KeyframableProp,
  Keyframe,
  KeyframeMap,
  TextProperties,
  TransitionType,
} from '../types';
import { NEUTRAL_COLOR, NEUTRAL_TRANSFORM, PROP_DEFAULTS } from '../types';
import { useProjectStore } from '../state/projectStore';
import { useMediaStore } from '../state/mediaStore';
import { useUiStore } from '../state/uiStore';
import { useT } from '../i18n';
import { effectiveValues, parseCubeLUT, upsertKeyframe } from '../utils';
import { playback } from '../engine/playback';
import { Select, Switch } from './controls';

const FONTS = [
  'Arial', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia',
  'Times New Roman', 'Courier New', 'Impact', 'Segoe UI', 'Comic Sans MS',
];

const TRANSITIONS: TransitionType[] = [
  'crossfade', 'dipBlack', 'dipWhite', 'wipeLeft', 'wipeRight', 'wipeUp', 'wipeDown',
];

const RES_PRESETS: { w: number; h: number; ratio: string }[] = [
  { w: 1920, h: 1080, ratio: '16:9' },
  { w: 3840, h: 2160, ratio: '16:9 · UHD' },
  { w: 2560, h: 1440, ratio: '16:9 · QHD' },
  { w: 1280, h: 720, ratio: '16:9 · HD' },
  { w: 1080, h: 1920, ratio: '9:16' },
  { w: 1080, h: 1080, ratio: '1:1' },
  { w: 1080, h: 1350, ratio: '4:5' },
];

const FPS_OPTIONS = [24, 25, 30, 50, 60];

const MIN_DIM = 16;
const MAX_DIM = 7680;

/** Dosyayı data URL'e çevirir. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('okunamadı'));
    fr.readAsDataURL(file);
  });
}

/** PNG'de saydamlık var mı? Yoksa maske parlaklıktan türetilecek. */
async function pngHasTransparency(dataUrl: string): Promise<boolean> {
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('png'));
      img.src = dataUrl;
    });
    const w = Math.min(64, Math.max(1, img.naturalWidth));
    const h = Math.min(64, Math.max(1, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return true;
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
    return false;
  } catch {
    return true;
  }
}

type Tab = 'transform' | 'color' | 'audio' | 'text';

/**
 * Etiketli kaydırıcı: değer kutusuna tıklayınca sayı elle girilebilir;
 * çift tık (slider üzerinde) = parametreyi varsayılana sıfırla;
 * keyframe'li özellikte değer değişikliği playhead'e kf yazar.
 */
function Slider({
  label,
  value,
  min,
  max,
  step,
  onInput,
  format,
  defaultValue,
  keyframable,
  keyframed,
  onAddKeyframe,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onInput: (v: number) => void;
  format?: (v: number) => string;
  defaultValue?: number;
  keyframable?: boolean;
  keyframed?: boolean;
  onAddKeyframe?: () => void;
}) {
  const resetTo = defaultValue ?? min;
  // bozuk/eksik veriye karşı: value her zaman sayı olmalı (yoksa arayüz çöker)
  const safeValue = Number.isFinite(value) ? value : 0;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const startEdit = () => {
    setDraft(String(value));
    setEditing(true);
  };
  const commit = () => {
    const parsed = Number(draft.trim().replace(',', '.'));
    if (Number.isFinite(parsed)) {
      const clamped = Math.max(min, Math.min(max, parsed));
      const stepped = Math.round(clamped / step) * step;
      onInput(Number(stepped.toFixed(6)));
    }
    setEditing(false);
  };

  return (
    <div className="insp-row">
      <span className="insp-label">{label}</span>
      {keyframable && (
        <button
          className={`icon-btn mini diamond-btn ${keyframed ? 'active' : ''}`}
          title={keyframed ? 'Keyframe güncelle (imleç)' : 'Keyframe ekle (imleç)'}
          onClick={onAddKeyframe}
        >
          <Diamond size={10} fill={keyframed ? 'currentColor' : 'none'} />
        </button>
      )}
      <input
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={safeValue}
        title="Çift tık: sıfırla"
        onChange={(e) => onInput(Number(e.target.value))}
        onDoubleClick={() => onInput(resetTo)}
      />
      {editing ? (
        <input
          className="insp-value-input"
          value={draft}
          autoFocus
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape') setEditing(false);
            e.stopPropagation();
          }}
        />
      ) : (
        <span className="insp-value editable" title="Tıkla: elle gir" onClick={startEdit}>
          {format ? format(safeValue) : safeValue.toFixed(2)}
        </span>
      )}
    </div>
  );
}

/**
 * Profesyonel renk çarkı (Lift/Gamma/Gain): dairesel pad'de sürüklenen
 * nokta o ton aralığının rengini kaydırır; altındaki kaydırıcı parlaklığı.
 * Çift tık = sıfırla. Nokta konumu -1..1 (x sağ=kırmızı, y alt=sarı-yeşil).
 */
function ColorWheel({
  label,
  x,
  y,
  master,
  onChange,
}: {
  label: string;
  x: number;
  y: number;
  master: number;
  onChange: (v: { x: number; y: number; master: number }) => void;
}) {
  const R = 46; // yarıçap px
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    try { el.setPointerCapture(e.pointerId); } catch { /* yok say */ }
    const move = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      let dx = (ev.clientX - (r.left + r.width / 2)) / R;
      let dy = (ev.clientY - (r.top + r.height / 2)) / R;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      onChange({ x: Math.round(dx * 1000) / 1000, y: Math.round(dy * 1000) / 1000, master });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className="cwheel">
      <span className="cwheel-label">{label}</span>
      <div
        className="cwheel-pad"
        onPointerDown={onDown}
        onDoubleClick={() => onChange({ x: 0, y: 0, master })}
        title="Sürükle: renk dengesi · Çift tık: sıfırla"
      >
        <span className="cwheel-dot" style={{ left: `calc(50% + ${x * R}px)`, top: `calc(50% + ${y * R}px)` }} />
      </div>
      <input
        type="range"
        className="slider cwheel-master"
        min={-1}
        max={1}
        step={0.01}
        value={master}
        title="Parlaklık"
        onChange={(e) => onChange({ x, y, master: Number(e.target.value) })}
        onDoubleClick={() => onChange({ x, y, master: 0 })}
      />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="insp-row">
      <span className="insp-label">{label}</span>
      <div className="insp-control">{children}</div>
    </div>
  );
}

/** Klip seçili değilken: Proje Ayarları (ad, çözünürlük, fps). */
function ProjectSettingsSection() {
  const t = useT();
  const settings = useProjectStore((s) => s.settings);
  const setSettings = useProjectStore((s) => s.setSettings);
  const [dims, setDims] = useState({ w: String(settings.width), h: String(settings.height) });
  const [err, setErr] = useState('');

  useEffect(() => {
    setDims({ w: String(settings.width), h: String(settings.height) });
  }, [settings.width, settings.height]);

  const commitDims = () => {
    const w = Math.round(Number(dims.w));
    const h = Math.round(Number(dims.h));
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < MIN_DIM || h < MIN_DIM || w > MAX_DIM || h > MAX_DIM) {
      setErr(t('settings.invalidDims'));
      setDims({ w: String(settings.width), h: String(settings.height) });
      return;
    }
    setErr('');
    setSettings({ width: w, height: h });
  };

  const dimInput = (key: 'w' | 'h', aria: string) => (
    <input
      className="input"
      type="number"
      min={MIN_DIM}
      max={MAX_DIM}
      value={dims[key]}
      aria-label={aria}
      onChange={(e) => {
        setErr('');
        setDims((d) => ({ ...d, [key]: e.target.value }));
      }}
      onBlur={commitDims}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );

  const applyPreset = (key: string) => {
    if (key === 'custom') return;
    const p = RES_PRESETS.find((r) => `${r.w}x${r.h}` === key);
    if (p) {
      setErr('');
      setSettings({ width: p.w, height: p.h });
    }
  };

  const matched = RES_PRESETS.find((p) => p.w === settings.width && p.h === settings.height);

  return (
    <div className="insp-section">
      <div className="insp-section-title">
        {t('inspector.projectSettings')}
        <span className="insp-hint">{t('inspector.projectSettingsHint')}</span>
      </div>
      <Row label={t('settings.projectName')}>
        <input
          className="input"
          value={settings.name}
          placeholder={t('topbar.untitled')}
          spellCheck={false}
          onChange={(e) => setSettings({ name: e.target.value })}
        />
      </Row>
      <Row label={t('settings.resolution')}>
        <Select
          slim
          value={matched ? `${matched.w}x${matched.h}` : 'custom'}
          options={[
            ...RES_PRESETS.map((p) => ({ value: `${p.w}x${p.h}`, label: `${p.w} × ${p.h} (${p.ratio})` })),
            { value: 'custom', label: t('settings.resolution.custom') },
          ]}
          onChange={applyPreset}
        />
      </Row>
      <div className="insp-row">
        <span className="insp-label">{t('settings.resolution.custom')}</span>
        <div className="insp-control dim-row">
          {dimInput('w', 'width')}
          {dimInput('h', 'height')}
          <button
            className="icon-btn"
            title={t('settings.swapDims')}
            onClick={() => setSettings({ width: settings.height, height: settings.width })}
          >
            <Repeat size={13} />
          </button>
        </div>
      </div>
      <Row label={t('settings.fps')}>
        <Select
          slim
          value={settings.fps}
          options={FPS_OPTIONS.map((f) => ({ value: f, label: String(f) }))}
          onChange={(f) => setSettings({ fps: f })}
        />
      </Row>
      {err && <div className="dialog-error">{err}</div>}
    </div>
  );
}

export function Inspector() {
  const t = useT();
  const selectedClipIds = useUiStore((s) => s.selectedClipIds);
  const selectClip = useUiStore((s) => s.selectClip);
  const clips = useProjectStore((s) => s.clips);
  const tracks = useProjectStore((s) => s.tracks);
  const currentTime = useProjectStore((s) => s.currentTime);
  const updateClip = useProjectStore((s) => s.updateClip);
  const setClipSpeed = useProjectStore((s) => s.setClipSpeed);
  const detachAudio = useProjectStore((s) => s.detachAudio);
  const splitClip = useProjectStore((s) => s.splitClip);
  const addClipFromAsset = useProjectStore((s) => s.addClipFromAsset);
  const attachMaskClip = useProjectStore((s) => s.attachMaskClip);
  const assets = useMediaStore((s) => s.assets);
  const addImageBlob = useMediaStore((s) => s.addImageBlob);
  const lutInputRef = useRef<HTMLInputElement>(null);
  const maskInputRef = useRef<HTMLInputElement>(null);
  const maskVideoInputRef = useRef<HTMLInputElement>(null);
  const [lutError, setLutError] = useState('');
  const [maskError, setMaskError] = useState('');

  const clipId = selectedClipIds.length === 1 ? selectedClipIds[0] : null;
  const clip = clipId ? clips.find((c) => c.id === clipId) ?? null : null;
  const asset = clip?.assetId ? assets.find((a) => a.id === clip.assetId) ?? null : null;
  const isText = clip?.kind === 'text';
  const hasAudio =
    clip != null && (isText ? false : asset != null && (asset.kind === 'audio' || asset.hasAudio));

  const [tab, setTab] = useState<Tab>('transform');
  useEffect(() => {
    if (isText && tab === 'color') setTab('transform');
    if (isText && tab === 'transform') setTab('text');
    if (!isText && tab === 'text') setTab('transform');
    if (!hasAudio && tab === 'audio') setTab(isText ? 'text' : 'transform');
  }, [clipId, isText, hasAudio, tab]);

  if (!clip) {
    return (
      <section className="panel" aria-label={t('inspector.title')}>
        <div className="panel-header">
          <span className="panel-title">{t('inspector.title')}</span>
        </div>
        <div className="panel-body inspector-body">
          <ProjectSettingsSection />
          <div className="inspector-empty">
            <div className="empty-hint">
              <MousePointerClick size={22} />
              {t('inspector.empty')}
            </div>
          </div>
        </div>
      </section>
    );
  }

  const localT = Math.max(0, Math.min(clip.duration, currentTime - clip.start));
  const eff = effectiveValues(clip, currentTime);
  const inClip = currentTime >= clip.start && currentTime < clip.start + clip.duration;

  const patchTransformProp = (prop: 'x' | 'y' | 'scale' | 'rotation' | 'opacity', v: number) => {
    const transform: ClipTransform = { ...clip.transform, [prop]: v };
    if (clip.keyframes?.[prop]?.length) {
      const kfs = upsertKeyframe(clip, prop, localT, v);
      updateClip(clip.id, { transform, keyframes: kfs }, true);
    } else {
      updateClip(clip.id, { transform }, true);
    }
  };

  const addKfForProp = (prop: KeyframableProp, currentV: number) => {
    const kfs = upsertKeyframe(clip, prop, localT, currentV);
    updateClip(clip.id, { keyframes: kfs }, false);
  };

  const patchCrop = (patch: Partial<CropEdges>) =>
    updateClip(clip.id, { transform: { ...clip.transform, crop: { ...clip.transform.crop, ...patch } } }, true);
  const patchColor = (patch: Partial<ColorEffects>) =>
    updateClip(clip.id, { color: { ...clip.color, ...patch } }, true);
  const patchAudio = (patch: Partial<typeof clip.audio>) =>
    updateClip(clip.id, { audio: { ...clip.audio, ...patch } }, true);
  const patchMask = (patch: Partial<ClipMask>) =>
    updateClip(clip.id, { mask: { ...clip.mask, ...patch } }, true);
  const patchChroma = (patch: Partial<ChromaKey>) =>
    updateClip(clip.id, { chroma: { ...clip.chroma, ...patch } }, true);
  const patchText = (patch: Partial<TextProperties>) =>
    updateClip(clip.id, { text: { ...clip.text!, ...patch } }, true);

  const freezeFrame = async () => {
    const canvas = document.querySelector('.preview-frame canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) return;
    const assetId = await addImageBlob(blob, `${clip.name} — donmuş kare.png`);
    if (assetId) {
      const newId = addClipFromAsset(assetId, undefined, clip.start + clip.duration);
      if (newId) selectClip(newId);
    }
  };

  const onLutFile = async (file: File) => {
    setLutError('');
    const text = await file.text();
    const parsed = parseCubeLUT(text);
    if (!parsed) {
      setLutError(t('inspector.lutInvalid'));
      return;
    }
    updateClip(clip.id, { lut: { name: file.name, size: parsed.size, data: parsed.data, strength: 1 } }, false);
  };

  const onMaskImageFile = async (file: File) => {
    setMaskError('');
    try {
      const dataUrl = await readAsDataUrl(file);
      const useAlpha = await pngHasTransparency(dataUrl);
      patchMask({ image: { name: file.name, dataUrl, useAlpha } });
    } catch {
      setMaskError(t('inspector.maskImageInvalid'));
    }
  };

  /** Animasyonlu maske videosu: medya kutusuna varlık olarak ekler, maskenin kaynağı yapar. */
  const onMaskVideoFile = async (file: File) => {
    setMaskError('');
    const before = useMediaStore.getState().assets.length;
    await useMediaStore.getState().addFiles([file]);
    const after = useMediaStore.getState();
    if (after.assets.length > before) {
      const added = after.assets[after.assets.length - 1];
      patchMask({ videoAssetId: added.id });
    } else {
      setMaskError(t('inspector.maskVideoInvalid'));
    }
  };

  const tabs: Array<{ id: Tab; label: string; enabled: boolean }> = [
    { id: 'transform', label: t('inspector.tab.transform'), enabled: true },
    { id: 'color', label: t('inspector.tab.color'), enabled: !isText },
    { id: 'audio', label: t('inspector.tab.audio'), enabled: hasAudio },
    { id: 'text', label: t('inspector.tab.text'), enabled: isText },
  ];

  const track = tracks.find((tr) => tr.id === clip.trackId);
  const kfEntries = Object.entries(clip.keyframes ?? {}) as Array<[KeyframableProp, Keyframe[]]>;
  const kfCount = kfEntries.reduce((n, [, arr]) => n + (arr?.length ?? 0), 0);

  // maske klibi akışı: bu klip hangi hedefin maskesi?
  const maskTarget = clips.find((c) => c.maskClipId === clip.id) ?? null;
  const maskableTargets = clips.filter(
    (c) => c.id !== clip.id && c.kind === 'media' && c.assetId && !c.maskClipId,
  );
  const isMaskClip = !!maskTarget;

  return (
    <section className="panel" aria-label={t('inspector.title')}>
      <div className="panel-header">
        <span className="panel-title">{t('inspector.title')}</span>
        <div className="spacer" />
        <span className="insp-clip-name" title={clip.name}>{clip.name}</span>
      </div>
      <div className="inspector-tabs">
        {tabs.map((tb) => (
          <button key={tb.id} className={tab === tb.id ? 'active' : ''} disabled={!tb.enabled} onClick={() => setTab(tb.id)}>
            {tb.label}
          </button>
        ))}
      </div>
      <div className="panel-body inspector-body">
        <div className="insp-section">
          <div className="insp-section-title">{t('inspector.clipInfo')}</div>
          {clip.kind === 'media' && clip.assetId && (
            <>
              <Row label={t('inspector.maskTarget')}>
                <Select
                  slim
                  value={maskTarget ? maskTarget.id : 'none'}
                  options={[
                    { value: 'none', label: t('inspector.maskTarget.none') },
                    ...maskableTargets.map((c) => ({
                      value: c.id,
                      label: `${c.name} (${c.start.toFixed(1)}sn)`,
                    })),
                  ]}
                  onChange={(v) => attachMaskClip(clip.id, v === 'none' ? null : v)}
                />
              </Row>
              {isMaskClip && <div className="insp-note">{t('inspector.maskTarget.hint')}</div>}
            </>
          )}
          <Row label={t('inspector.track')}>
            <span className="insp-readonly">{track?.name ?? '—'}</span>
          </Row>
          <Row label={t('inspector.start')}>
            <span className="insp-readonly">{clip.start.toFixed(2)} sn</span>
          </Row>
          <Row label={t('inspector.duration')}>
            <span className="insp-readonly">{clip.duration.toFixed(2)} sn</span>
          </Row>
          <Row label={t('inspector.transition')}>
            <Select
              slim
              value={clip.transitionIn?.type ?? 'none'}
              options={[
                { value: 'none', label: t('inspector.transition.none') },
                ...TRANSITIONS.map((tr) => ({ value: tr as string, label: t(`transition.${tr}`) })),
              ]}
              onChange={(v) =>
                updateClip(
                  clip.id,
                  v === 'none'
                    ? { transitionIn: undefined }
                    : { transitionIn: { type: v as TransitionType, duration: clip.transitionIn?.duration ?? 0.6 } },
                )
              }
            />
          </Row>
          {clip.transitionIn && (
            <Slider
              label={t('inspector.transitionDuration')}
              value={clip.transitionIn.duration}
              min={0.1}
              max={Math.min(4, clip.duration)}
              step={0.1}
              defaultValue={0.6}
              onInput={(v) => updateClip(clip.id, { transitionIn: { ...clip.transitionIn!, duration: v } }, true)}
              format={(v) => `${v.toFixed(1)} sn`}
            />
          )}
        </div>

        {tab === 'transform' && (
          <>
            <div className="insp-section">
              <div className="insp-section-title">
                {t('inspector.tab.transform')}
                <span className="insp-hint">{t('inspector.dragHint')}</span>
                <button
                  className="icon-btn mini"
                  title={t('inspector.reset')}
                  onClick={() => updateClip(clip.id, { transform: structuredClone(NEUTRAL_TRANSFORM), keyframes: undefined })}
                >
                  <RotateCcw size={12} />
                </button>
              </div>
              {!inClip && <div className="insp-note">{t('inspector.notAtPlayhead')}</div>}
              <Slider label={t('inspector.posX')} value={eff.x} min={-2000} max={2000} step={1} defaultValue={PROP_DEFAULTS.x} keyframable keyframed={!!clip.keyframes?.x?.length} onAddKeyframe={() => addKfForProp('x', eff.x)} onInput={(v) => patchTransformProp('x', v)} format={(v) => `${v.toFixed(0)} px`} />
              <Slider label={t('inspector.posY')} value={eff.y} min={-2000} max={2000} step={1} defaultValue={PROP_DEFAULTS.y} keyframable keyframed={!!clip.keyframes?.y?.length} onAddKeyframe={() => addKfForProp('y', eff.y)} onInput={(v) => patchTransformProp('y', v)} format={(v) => `${v.toFixed(0)} px`} />
              <Slider label={t('inspector.scale')} value={eff.scale} min={0.05} max={5} step={0.01} defaultValue={PROP_DEFAULTS.scale} keyframable keyframed={!!clip.keyframes?.scale?.length} onAddKeyframe={() => addKfForProp('scale', eff.scale)} onInput={(v) => patchTransformProp('scale', v)} format={(v) => `×${v.toFixed(2)}`} />
              <Slider label={t('inspector.rotation')} value={eff.rotation} min={-180} max={180} step={1} defaultValue={PROP_DEFAULTS.rotation} keyframable keyframed={!!clip.keyframes?.rotation?.length} onAddKeyframe={() => addKfForProp('rotation', eff.rotation)} onInput={(v) => patchTransformProp('rotation', v)} format={(v) => `${v.toFixed(0)}°`} />
              <Slider label={t('inspector.opacity')} value={eff.opacity} min={0} max={1} step={0.01} defaultValue={PROP_DEFAULTS.opacity} keyframable keyframed={!!clip.keyframes?.opacity?.length} onAddKeyframe={() => addKfForProp('opacity', eff.opacity)} onInput={(v) => patchTransformProp('opacity', v)} format={(v) => `${Math.round(v * 100)}%`} />
              <div className="insp-subtitle">{t('inspector.crop')}</div>
              <Slider label={t('inspector.cropTop')} value={clip.transform.crop.top} min={0} max={0.45} step={0.005} defaultValue={0} onInput={(v) => patchCrop({ top: v })} format={(v) => `${Math.round(v * 100)}%`} />
              <Slider label={t('inspector.cropBottom')} value={clip.transform.crop.bottom} min={0} max={0.45} step={0.005} defaultValue={0} onInput={(v) => patchCrop({ bottom: v })} format={(v) => `${Math.round(v * 100)}%`} />
              <Slider label={t('inspector.cropLeft')} value={clip.transform.crop.left} min={0} max={0.45} step={0.005} defaultValue={0} onInput={(v) => patchCrop({ left: v })} format={(v) => `${Math.round(v * 100)}%`} />
              <Slider label={t('inspector.cropRight')} value={clip.transform.crop.right} min={0} max={0.45} step={0.005} defaultValue={0} onInput={(v) => patchCrop({ right: v })} format={(v) => `${Math.round(v * 100)}%`} />
            </div>

            <div className="insp-section">
              <div className="insp-section-title">
                {t('inspector.mask')}
                <Switch checked={clip.mask.enabled} onChange={(v) => patchMask({ enabled: v })} />
              </div>
              {clip.mask.enabled && (
                <>
                  <Row label={t('inspector.maskShape')}>
                    <Select
                      slim
                      value={clip.mask.shape}
                      options={[
                        { value: 'rect', label: t('inspector.maskRect') },
                        { value: 'ellipse', label: t('inspector.maskEllipse') },
                        { value: 'image', label: t('inspector.maskImage') },
                        { value: 'video', label: t('inspector.maskVideo') },
                      ]}
                      onChange={(v) => patchMask({ shape: v as ClipMask['shape'] })}
                    />
                  </Row>
                  {clip.mask.shape === 'video' && (
                    <>
                      <div className="insp-actions">
                        <button className="btn slim" onClick={() => maskVideoInputRef.current?.click()}>
                          <Upload size={12} />
                          {clip.mask.videoAssetId
                            ? assets.find((a) => a.id === clip.mask.videoAssetId)?.name ?? t('inspector.maskVideoLoad')
                            : t('inspector.maskVideoLoad')}
                        </button>
                        {clip.mask.videoAssetId && (
                          <button className="btn slim" onClick={() => patchMask({ videoAssetId: undefined })}>
                            {t('inspector.maskImageRemove')}
                          </button>
                        )}
                        <input
                          ref={maskVideoInputRef}
                          type="file"
                          accept="video/*"
                          hidden
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void onMaskVideoFile(f);
                            e.target.value = '';
                          }}
                        />
                      </div>
                      <div className="insp-note">{t('inspector.maskVideoHint')}</div>
                      {maskError && <div className="dialog-error">{maskError}</div>}
                    </>
                  )}
                  {clip.mask.shape === 'image' && (
                    <>
                      <div className="insp-actions">
                        <button className="btn slim" onClick={() => maskInputRef.current?.click()}>
                          <Upload size={12} />
                          {clip.mask.image ? clip.mask.image.name : t('inspector.maskImageLoad')}
                        </button>
                        {clip.mask.image && (
                          <button className="btn slim" onClick={() => patchMask({ image: undefined })}>
                            {t('inspector.maskImageRemove')}
                          </button>
                        )}
                        <input
                          ref={maskInputRef}
                          type="file"
                          accept="image/png"
                          hidden
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void onMaskImageFile(f);
                            e.target.value = '';
                          }}
                        />
                      </div>
                      <div className="insp-note">{t('inspector.maskImageHint')}</div>
                      {maskError && <div className="dialog-error">{maskError}</div>}
                    </>
                  )}
                  <Slider label="X" value={clip.mask.x} min={0} max={1} step={0.005} defaultValue={0.5} onInput={(v) => patchMask({ x: v })} format={(v) => `${Math.round(v * 100)}%`} />
                  <Slider label="Y" value={clip.mask.y} min={0} max={1} step={0.005} defaultValue={0.5} onInput={(v) => patchMask({ y: v })} format={(v) => `${Math.round(v * 100)}%`} />
                  <Slider label={t('inspector.maskWidth')} value={clip.mask.width} min={0.02} max={1} step={0.005} defaultValue={0.5} onInput={(v) => patchMask({ width: v })} format={(v) => `${Math.round(v * 100)}%`} />
                  <Slider label={t('inspector.maskHeight')} value={clip.mask.height} min={0.02} max={1} step={0.005} defaultValue={0.5} onInput={(v) => patchMask({ height: v })} format={(v) => `${Math.round(v * 100)}%`} />
                  <Slider label={t('inspector.maskFeather')} value={clip.mask.feather} min={0.001} max={0.5} step={0.005} defaultValue={0.05} onInput={(v) => patchMask({ feather: v })} format={(v) => `${Math.round(v * 100)}%`} />
                  <Row label={t('inspector.maskInvert')}>
                    <Switch checked={clip.mask.invert} onChange={(v) => patchMask({ invert: v })} />
                  </Row>
                </>
              )}
            </div>

            <div className="insp-section">
              <div className="insp-section-title">{t('inspector.speedSection')}</div>
              <Slider
                label={t('inspector.speed')}
                value={clip.speed}
                min={0.25}
                max={8}
                step={0.05}
                defaultValue={1}
                onInput={(v) => setClipSpeed(clip.id, v)}
                format={(v) => `${v.toFixed(2)}×`}
              />
              <Row label={t('inspector.reverse')}>
                <div className="insp-control">
                  <Switch checked={clip.reverse} onChange={(v) => updateClip(clip.id, { reverse: v })} />
                  <Rewind size={12} />
                </div>
              </Row>
              <div className="insp-actions">
                <button className="btn slim" onClick={freezeFrame} title={t('inspector.freezeHint')}>
                  <Snowflake size={12} />
                  {t('inspector.freeze')}
                </button>
                <button className="btn slim" onClick={() => splitClip(clip.id, currentTime)} disabled={!inClip}>
                  <Split size={12} />
                  {t('inspector.splitHere')}
                </button>
                {asset?.kind === 'video' && asset.hasAudio && (
                  <button className="btn slim" onClick={() => detachAudio(clip.id)}>
                    {t('inspector.detachAudio')}
                  </button>
                )}
              </div>
            </div>

            {kfCount > 0 && (
              <div className="insp-section">
                <div className="insp-section-title">
                  {t('inspector.keyframes')} ({kfCount})
                  <button
                    className="icon-btn mini"
                    title={t('inspector.keyframesClear')}
                    onClick={() => updateClip(clip.id, { keyframes: undefined })}
                  >
                    <RotateCcw size={12} />
                  </button>
                </div>
                {kfEntries.map(([prop, kfs]) =>
                  kfs && kfs.length > 0 ? (
                    <div key={prop} className="kf-row">
                      <span className="kf-prop">{prop}</span>
                      {kfs.map((k, i) => (
                        <button
                          key={i}
                          className={`kf-chip ${Math.abs(k.t - localT) < 0.02 ? 'active' : ''}`}
                          title={`${k.t.toFixed(2)} sn → ${k.v}`}
                          onClick={() => playback.seek(clip.start + k.t)}
                        >
                          {i + 1}
                        </button>
                      ))}
                    </div>
                  ) : null,
                )}
              </div>
            )}
          </>
        )}

        {tab === 'color' && !isText && (
          <div className="insp-section">
            <div className="insp-section-title">
              {t('inspector.tab.color')}
              <button
                className="icon-btn mini"
                title={t('inspector.reset')}
                onClick={() => updateClip(clip.id, { color: { ...NEUTRAL_COLOR } })}
              >
                <RotateCcw size={12} />
              </button>
            </div>
            <div className="cwheels-row">
              <ColorWheel label={t('color.lift')} x={clip.color.liftX || 0} y={clip.color.liftY || 0} master={clip.color.liftMaster || 0} onChange={(v) => patchColor({ liftX: v.x, liftY: v.y, liftMaster: v.master })} />
              <ColorWheel label={t('color.gammaW')} x={clip.color.gammaX || 0} y={clip.color.gammaY || 0} master={clip.color.gammaMaster || 0} onChange={(v) => patchColor({ gammaX: v.x, gammaY: v.y, gammaMaster: v.master })} />
              <ColorWheel label={t('color.gain')} x={clip.color.gainX || 0} y={clip.color.gainY || 0} master={clip.color.gainMaster || 0} onChange={(v) => patchColor({ gainX: v.x, gainY: v.y, gainMaster: v.master })} />
            </div>
            <div className="insp-actions">
              <button className="btn slim" title={t('color.presetUnderwaterHint')} onClick={() => patchColor({ tint: 0.5, temperature: 0.18, vibrance: 0.35, shadows: 0.28, highlights: -0.12, contrast: 1.06, saturation: 1.08, liftX: -0.18, liftY: -0.42, gammaY: -0.12 })}>
                🌊 {t('color.presetUnderwater')}
              </button>
              <button className="btn slim" title={t('color.presetCinematicHint')} onClick={() => patchColor({ gainX: 0.55, gainY: 0.55, liftX: -0.5, liftY: -0.5, contrast: 1.12, saturation: 1.15, gammaMaster: 0.1 })}>
                🎬 {t('color.presetCinematic')}
              </button>
              <button className="btn slim" onClick={() => patchColor({ temperature: 0.35 })}>🔥 {t('color.presetWarm')}</button>
              <button className="btn slim" onClick={() => patchColor({ temperature: -0.35 })}>❄️ {t('color.presetCool')}</button>
              <button className="btn slim" onClick={() => updateClip(clip.id, { color: { ...NEUTRAL_COLOR } })}>{t('color.presetReset')}</button>
            </div>
            <Slider label={t('color.brightness')} value={clip.color.brightness} min={0} max={2} step={0.01} defaultValue={1} onInput={(v) => patchColor({ brightness: v })} />
            <Slider label={t('color.contrast')} value={clip.color.contrast} min={0} max={2} step={0.01} defaultValue={1} onInput={(v) => patchColor({ contrast: v })} />
            <Slider label={t('color.gamma')} value={clip.color.gamma} min={0.2} max={3} step={0.01} defaultValue={1} onInput={(v) => patchColor({ gamma: v })} />
            <Slider label={t('color.saturation')} value={clip.color.saturation} min={0} max={3} step={0.01} defaultValue={1} onInput={(v) => patchColor({ saturation: v })} />
            <Slider label={t('color.hue')} value={clip.color.hue} min={-180} max={180} step={1} defaultValue={0} onInput={(v) => patchColor({ hue: v })} format={(v) => `${v.toFixed(0)}°`} />
            <Slider label={t('color.exposure')} value={clip.color.exposure} min={-3} max={3} step={0.05} defaultValue={0} onInput={(v) => patchColor({ exposure: v })} format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(2)}`} />
            <Slider label={t('color.temperature')} value={clip.color.temperature} min={-1} max={1} step={0.01} defaultValue={0} onInput={(v) => patchColor({ temperature: v })} />
            <Slider label={t('color.tint')} value={clip.color.tint ?? 0} min={-1} max={1} step={0.01} defaultValue={0} onInput={(v) => patchColor({ tint: v })} />
            <Slider label={t('color.shadows')} value={clip.color.shadows ?? 0} min={-1} max={1} step={0.01} defaultValue={0} onInput={(v) => patchColor({ shadows: v })} />
            <Slider label={t('color.highlights')} value={clip.color.highlights ?? 0} min={-1} max={1} step={0.01} defaultValue={0} onInput={(v) => patchColor({ highlights: v })} />
            <Slider label={t('color.vibrance')} value={clip.color.vibrance ?? 0} min={-1} max={1} step={0.01} defaultValue={0} onInput={(v) => patchColor({ vibrance: v })} />
            <Slider label={t('color.sharpen')} value={clip.color.sharpen} min={0} max={1} step={0.01} defaultValue={0} onInput={(v) => patchColor({ sharpen: v })} format={(v) => `${Math.round(v * 100)}%`} />
            <Slider label={t('color.blur')} value={clip.color.blur} min={0} max={20} step={0.1} defaultValue={0} onInput={(v) => patchColor({ blur: v })} format={(v) => `${v.toFixed(1)} px`} />
            <Slider label={t('color.defog')} value={clip.color.defog} min={0} max={1} step={0.01} defaultValue={0} onInput={(v) => patchColor({ defog: v })} format={(v) => `${Math.round(v * 100)}%`} />

            <div className="insp-subtitle">{t('inspector.chroma')}</div>
            <Row label={t('inspector.chromaEnable')}>
              <Switch checked={clip.chroma.enabled} onChange={(v) => patchChroma({ enabled: v })} />
            </Row>
            {clip.chroma.enabled && (
              <>
                <Row label={t('inspector.chromaColor')}>
                  <input type="color" className="color-input" value={clip.chroma.color} onChange={(e) => patchChroma({ color: e.target.value })} />
                </Row>
                <Slider label={t('inspector.chromaSimilarity')} value={clip.chroma.similarity} min={0.02} max={1} step={0.01} defaultValue={0.4} onInput={(v) => patchChroma({ similarity: v })} />
                <Slider label={t('inspector.chromaSmoothness')} value={clip.chroma.smoothness} min={0} max={0.5} step={0.01} defaultValue={0.1} onInput={(v) => patchChroma({ smoothness: v })} />
              </>
            )}

            <div className="insp-subtitle">{t('inspector.lut')}</div>
            <div className="insp-actions">
              <button className="btn slim" onClick={() => lutInputRef.current?.click()}>
                <Upload size={12} />
                {clip.lut ? clip.lut.name : t('inspector.lutLoad')}
              </button>
              {clip.lut && (
                <button className="btn slim" onClick={() => updateClip(clip.id, { lut: undefined })}>
                  {t('inspector.lutRemove')}
                </button>
              )}
              <input ref={lutInputRef} type="file" accept=".cube" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onLutFile(f); e.target.value = ''; }} />
            </div>
            {lutError && <div className="dialog-error">{lutError}</div>}
            {clip.lut && (
              <Slider label={t('inspector.lutStrength')} value={clip.lut.strength} min={0} max={1} step={0.01} defaultValue={1} onInput={(v) => updateClip(clip.id, { lut: { ...clip.lut!, strength: v } }, true)} format={(v) => `${Math.round(v * 100)}%`} />
            )}
          </div>
        )}

        {tab === 'audio' && hasAudio && (
          <div className="insp-section">
            <div className="insp-section-title">{t('inspector.tab.audio')}</div>
            <Slider
              label={t('audio.volume')}
              value={eff.volume}
              min={0}
              max={2}
              step={0.01}
              defaultValue={PROP_DEFAULTS.volume}
              keyframable
              keyframed={!!clip.keyframes?.volume?.length}
              onAddKeyframe={() => addKfForProp('volume', eff.volume)}
              onInput={(v) => {
                if (clip.keyframes?.volume?.length) {
                  const kfs: KeyframeMap = upsertKeyframe(clip, 'volume', localT, v);
                  updateClip(clip.id, { keyframes: kfs }, true);
                } else {
                  patchAudio({ volume: v });
                }
              }}
              format={(v) => `${Math.round(v * 100)}%`}
            />
            <Row label={t('audio.mute')}>
              <Switch checked={clip.audio.muted} onChange={(v) => updateClip(clip.id, { audio: { ...clip.audio, muted: v } })} />
            </Row>
            <Slider label={t('audio.fadeIn')} value={clip.audio.fadeIn} min={0} max={Math.min(10, clip.duration)} step={0.1} defaultValue={0} onInput={(v) => patchAudio({ fadeIn: v })} format={(v) => `${v.toFixed(1)} sn`} />
            <Slider label={t('audio.fadeOut')} value={clip.audio.fadeOut} min={0} max={Math.min(10, clip.duration)} step={0.1} defaultValue={0} onInput={(v) => patchAudio({ fadeOut: v })} format={(v) => `${v.toFixed(1)} sn`} />
            <Row label={t('audio.noiseReduce')}>
              <Switch checked={clip.audio.noiseReduce} title={t('audio.noiseReduceHint')} onChange={(v) => updateClip(clip.id, { audio: { ...clip.audio, noiseReduce: v } })} />
            </Row>
          </div>
        )}

        {tab === 'text' && isText && clip.text && (
          <div className="insp-section">
            <div className="insp-section-title">{t('inspector.tab.text')}</div>
            <Row label={t('text.content')}>
              <textarea
                className="input area"
                rows={3}
                value={clip.text.content}
                placeholder={t('text.contentPlaceholder')}
                onChange={(e) => patchText({ content: e.target.value })}
              />
            </Row>
            <Row label={t('text.font')}>
              <Select
                slim
                value={clip.text.fontFamily}
                options={FONTS.map((f) => ({ value: f, label: f, style: { fontFamily: f } }))}
                onChange={(f) => patchText({ fontFamily: f })}
              />
            </Row>
            <Slider label={t('text.size')} value={clip.text.fontSize} min={12} max={400} step={1} defaultValue={96} onInput={(v) => patchText({ fontSize: v })} format={(v) => `${v.toFixed(0)} px`} />
            <Row label={t('text.color')}>
              <input type="color" className="color-input" value={clip.text.color} onChange={(e) => patchText({ color: e.target.value })} />
            </Row>
            <Row label={t('text.style')}>
              <button className={`icon-btn mini ${clip.text.bold ? 'active' : ''}`} title={t('text.bold')} onClick={() => patchText({ bold: !clip.text!.bold })}>
                <Bold size={12} />
              </button>
              <button className={`icon-btn mini ${clip.text.italic ? 'active' : ''}`} title={t('text.italic')} onClick={() => patchText({ italic: !clip.text!.italic })}>
                <Italic size={12} />
              </button>
            </Row>
            <Row label={t('text.align')}>
              <Select
                slim
                value={clip.text.align}
                options={[
                  { value: 'left', label: t('text.alignLeft') },
                  { value: 'center', label: t('text.alignCenter') },
                  { value: 'right', label: t('text.alignRight') },
                ]}
                onChange={(v) => patchText({ align: v as TextProperties['align'] })}
              />
            </Row>
            <div className="insp-subtitle">{t('text.stroke')}</div>
            <Row label={t('text.strokeColor')}>
              <input type="color" className="color-input" value={clip.text.strokeColor} onChange={(e) => patchText({ strokeColor: e.target.value })} />
            </Row>
            <Slider label={t('text.strokeWidth')} value={clip.text.strokeWidth} min={0} max={30} step={0.5} defaultValue={0} onInput={(v) => patchText({ strokeWidth: v })} format={(v) => v.toFixed(1)} />
            <div className="insp-subtitle">{t('text.shadow')}</div>
            <Row label={t('text.shadowColor')}>
              <input type="color" className="color-input" value={clip.text.shadowColor} onChange={(e) => patchText({ shadowColor: e.target.value })} />
            </Row>
            <Slider label={t('text.shadowBlur')} value={clip.text.shadowBlur} min={0} max={60} step={1} defaultValue={8} onInput={(v) => patchText({ shadowBlur: v })} format={(v) => v.toFixed(0)} />
            <Slider label={t('text.shadowOffsetX')} value={clip.text.shadowOffsetX} min={-40} max={40} step={1} defaultValue={0} onInput={(v) => patchText({ shadowOffsetX: v })} format={(v) => v.toFixed(0)} />
            <Slider label={t('text.shadowOffsetY')} value={clip.text.shadowOffsetY} min={-40} max={40} step={1} defaultValue={2} onInput={(v) => patchText({ shadowOffsetY: v })} format={(v) => v.toFixed(0)} />
            <div className="insp-subtitle">{t('text.background')}</div>
            <Row label={t('text.bgColor')}>
              <div className="color-none">
                <input type="color" className="color-input" value={clip.text.backgroundColor === 'transparent' ? '#000000' : clip.text.backgroundColor} onChange={(e) => patchText({ backgroundColor: e.target.value })} />
                <button
                  className="btn slim"
                  onClick={() => patchText({ backgroundColor: clip.text!.backgroundColor === 'transparent' ? '#000000' : 'transparent' })}
                >
                  <TypeIcon size={12} />
                  {clip.text.backgroundColor === 'transparent' ? t('text.bgAdd') : t('text.bgNone')}
                </button>
              </div>
            </Row>
            <Slider label={t('text.bgPadding')} value={clip.text.backgroundPadding} min={0} max={80} step={1} defaultValue={12} onInput={(v) => patchText({ backgroundPadding: v })} format={(v) => v.toFixed(0)} />
            <div className="insp-subtitle">{t('text.animation')}</div>
            <Row label={t('text.animationType')}>
              <Select
                slim
                value={clip.text.animation}
                options={[
                  { value: 'none', label: t('text.animNone') },
                  { value: 'fade', label: t('text.animFade') },
                  { value: 'slideUp', label: t('text.animSlideUp') },
                  { value: 'slideDown', label: t('text.animSlideDown') },
                  { value: 'slideLeft', label: t('text.animSlideLeft') },
                  { value: 'slideRight', label: t('text.animSlideRight') },
                  { value: 'typewriter', label: t('text.animTypewriter') },
                  { value: 'pop', label: t('text.animPop') },
                  { value: 'zoomIn', label: t('text.animZoomIn') },
                  { value: 'blurIn', label: t('text.animBlurIn') },
                  { value: 'bounceIn', label: t('text.animBounceIn') },
                  { value: 'flipIn', label: t('text.animFlipIn') },
                  { value: 'tracking', label: t('text.animTracking') },
                  { value: 'spinIn', label: t('text.animSpinIn') },
                ]}
                onChange={(v) => patchText({ animation: v as TextProperties['animation'] })}
              />
            </Row>
            {clip.text.animation !== 'none' && (
              <Slider label={t('text.animationDuration')} value={clip.text.animationDuration} min={0.1} max={3} step={0.1} defaultValue={0.5} onInput={(v) => patchText({ animationDuration: v })} format={(v) => `${v.toFixed(1)} sn`} />
            )}
          </div>
        )}
      </div>
    </section>
  );
}
