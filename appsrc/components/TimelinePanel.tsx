import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Diamond,
  Eye,
  EyeOff,
  Film,
  GripVertical,
  Lock,
  Magnet,
  Music,
  Plus,
  Scissors,
  Trash2,
  Unlock,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
  Type as TypeIcon,
} from 'lucide-react';
import type { Clip, MediaAsset, Track } from '../types';
import { timelineDuration, useProjectStore } from '../state/projectStore';
import { useMediaStore } from '../state/mediaStore';
import { useUiStore } from '../state/uiStore';
import { useT } from '../i18n';
import { playback } from '../engine/playback';

const RULER_H = 28;
const VIDEO_LANE_H = 54;
const AUDIO_LANE_H = 44;
const HEADER_W = 150;
const SNAP_PX = 8;
const EDGE_PX = 10;

const RULER_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

function laneHeight(kind: Track['kind']): number {
  return kind === 'video' ? VIDEO_LANE_H : AUDIO_LANE_H;
}

function clampish(v: number): number {
  return Math.min(1000, Math.max(4, v));
}

const markerClicks = new Map<string, number>();

/** --- Filmstrip: sprite karelerini klip kaynak penceresine göre dizer --- */
function Filmstrip({ asset, clip, width, height }: { asset: MediaAsset; clip: Clip; width: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!asset.stripUrl) return;
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setReady(true);
    };
    img.src = asset.stripUrl;
    return () => setReady(false);
  }, [asset.stripUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready || !imgRef.current || width <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    const img = imgRef.current;
    const frames = asset.stripFrames ?? 8;
    const frameW = img.naturalWidth / frames;
    const srcDur = asset.duration || 1;
    // Kare i, kaynağın i*step saniyesindedir (üretimde sabit adım örneklenir)
    const step = asset.stripStep ?? srcDur / frames;
    const pxPerSrcSec = width / Math.max(0.001, clip.duration * clip.speed);
    const tileW = Math.max(2, Math.ceil(step * pxPerSrcSec) + 1);
    for (let x = 0; x < width; x += tileW) {
      const srcT = clip.srcIn + x / pxPerSrcSec;
      const fi = Math.min(frames - 1, Math.max(0, Math.floor(srcT / step)));
      ctx.drawImage(img, fi * frameW, 0, frameW, img.naturalHeight, x, 0, tileW, height);
    }
  }, [ready, asset, clip.srcIn, clip.duration, clip.speed, width, height]);

  if (!asset.stripUrl) {
    return asset.thumbUrl ? (
      <div className="tl-thumb-strip" style={{ backgroundImage: `url(${asset.thumbUrl})` }} />
    ) : null;
  }
  return <canvas ref={canvasRef} className="tl-filmstrip" style={{ width, height }} />;
}

/** --- Dalga formu çizimi --- */
function Waveform({ asset, clip, width, height }: { asset: MediaAsset; clip: Clip; width: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !asset.waveform || width <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    const peaks = asset.waveform;
    const srcDur = asset.duration || peaks.length / 20;
    const from = Math.max(0, Math.floor((clip.srcIn / srcDur) * peaks.length));
    const to = Math.min(peaks.length, Math.ceil(((clip.srcIn + clip.duration) / srcDur) * peaks.length));
    const n = Math.max(1, to - from);
    const mid = height / 2;
    ctx.fillStyle = 'rgba(126, 211, 154, 0.85)';
    const barW = Math.max(1, Math.min(3, width / 300));
    const pxPerBar = barW + 1;
    const step = Math.max(1, Math.floor(n / Math.max(1, width / pxPerBar)));
    for (let x = 0, i = 0; i < n; i += step, x += pxPerBar) {
      let peak = 0;
      for (let j = i; j < Math.min(i + step, n); j++) peak = Math.max(peak, peaks[from + j]);
      const h = Math.max(1, peak * (height * 0.9));
      ctx.fillRect(x, mid - h / 2, barW, h);
    }
  }, [asset, clip.srcIn, clip.duration, width, height]);
  return <canvas ref={canvasRef} style={{ width, height }} />;
}

/** --- Oynatma imleci --- */
function Playhead({ pxPerSec, scrollRef }: { pxPerSec: number; scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const currentTime = useProjectStore((s) => s.currentTime);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  useEffect(() => {
    if (!isPlaying || !scrollRef.current) return;
    const el = scrollRef.current;
    const x = currentTime * pxPerSec;
    if (x > el.scrollLeft + el.clientWidth - 120) el.scrollLeft = x - el.clientWidth * 0.5;
    else if (x < el.scrollLeft + 40) el.scrollLeft = Math.max(0, x - 80);
  }, [currentTime, isPlaying, pxPerSec, scrollRef]);
  return (
    <div className="tl-playhead" style={{ left: currentTime * pxPerSec }}>
      <div className="tl-playhead-line" />
    </div>
  );
}

/** --- Cetvel + markerlar --- */
function Ruler({
  width,
  pxPerSec,
  markers,
  snap,
  edges,
  onMarkerSeek,
  onMarkerRemove,
}: {
  width: number;
  pxPerSec: number;
  markers: { id: string; t: number; color: string; label: string }[];
  snap: boolean;
  edges: number[];
  onMarkerSeek: (t: number) => void;
  onMarkerRemove: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useUiStore((s) => s.theme);
  const [, setThemeTick] = useState(0);
  useEffect(() => {
    // Sistem teması değişimi store değerini değiştirmez — attr'ü izle
    const mo = new MutationObserver(() => setThemeTick((x) => x + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = RULER_H * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${RULER_H}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    // Renkler tema değişkenlerinden — açık/koyu mod desteklenir
    const css = getComputedStyle(document.documentElement);
    const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    const rulerBg = v('--ruler-bg', '#14161a');
    const rulerTick = v('--ruler-tick', '#3a414d');
    const rulerLabel = v('--ruler-label', '#8b919c');
    const markerLabel = v('--bg-panel', '#0b0c0f');
    ctx.fillStyle = rulerBg;
    ctx.fillRect(0, 0, width, RULER_H);
    const step = RULER_STEPS.find((s) => s * pxPerSec >= 68) ?? 600;
    ctx.strokeStyle = rulerTick;
    ctx.fillStyle = rulerLabel;
    ctx.font = '10px Consolas, monospace';
    ctx.textBaseline = 'top';
    for (let t = 0; t * pxPerSec <= width; t += step) {
      const x = Math.round(t * pxPerSec) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, RULER_H - 8);
      ctx.lineTo(x, RULER_H);
      ctx.stroke();
      const m = Math.floor(t / 60);
      const s = t % 60;
      const label = m > 0 ? `${m}:${String(Math.floor(s)).padStart(2, '0')}` : `${s.toFixed(step < 1 ? 2 : 0)}s`;
      ctx.fillText(label, x + 3, 4);
      for (let k = 1; k < 5; k++) {
        const mx = Math.round((t + (step * k) / 5) * pxPerSec) + 0.5;
        if (mx > width) break;
        ctx.beginPath();
        ctx.moveTo(mx, RULER_H - 4);
        ctx.lineTo(mx, RULER_H);
        ctx.stroke();
      }
    }
    for (const mk of markers) {
      const x = Math.round(mk.t * pxPerSec);
      if (x < 0 || x > width) continue;
      ctx.fillStyle = mk.color;
      ctx.beginPath();
      ctx.moveTo(x, RULER_H - 12);
      ctx.lineTo(x + 6, RULER_H - 6);
      ctx.lineTo(x, RULER_H);
      ctx.lineTo(x - 6, RULER_H - 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = markerLabel;
      ctx.font = 'bold 8px Consolas, monospace';
      ctx.fillText(mk.label, x - 5, RULER_H - 12);
      ctx.font = '10px Consolas, monospace';
      ctx.fillStyle = rulerLabel;
    }
    ctx.strokeStyle = rulerTick;
    ctx.beginPath();
    ctx.moveTo(0, RULER_H - 0.5);
    ctx.lineTo(width, RULER_H - 0.5);
    ctx.stroke();
  }, [width, pxPerSec, markers, theme]);

  const markerAt = (clientX: number): { id: string; t: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const t = (clientX - rect.left) / pxPerSec;
    for (const mk of markers) {
      if (Math.abs(mk.t - t) * pxPerSec < 8) return { id: mk.id, t: mk.t };
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sentetik olay */ }
    const mk = markerAt(e.clientX);
    if (mk) {
      const now = Date.now();
      const last = markerClicks.get(mk.id) ?? 0;
      markerClicks.set(mk.id, now);
      if (now - last < 450) {
        onMarkerRemove(mk.id);
        markerClicks.delete(mk.id);
        return;
      }
      onMarkerSeek(mk.t);
      return;
    }
    // İmleç sürüklerken: klip kenarlarına ve işaretçilere mıknatıslanır
    const seekTo = (ev: { clientX: number }) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      let tt = Math.max(0, (ev.clientX - rect.left) / pxPerSec);
      if (snap) {
        const th = SNAP_PX / pxPerSec;
        let bestD = th;
        for (const e of [0, ...edges, ...markers.map((m) => m.t)]) {
          const d = Math.abs(e - tt);
          if (d < bestD) {
            bestD = d;
            tt = e;
          }
        }
      }
      playback.seek(tt);
    };
    seekTo(e);
    const move = (ev: PointerEvent) => seekTo(ev);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return <canvas ref={canvasRef} className="tl-ruler" onPointerDown={onPointerDown} />;
}

/** --- Klip --- */
interface ClipViewProps {
  clip: Clip;
  asset: MediaAsset | undefined;
  pxPerSec: number;
  selected: boolean;
  isMask?: boolean;
  onPointerDown: (e: React.PointerEvent, clip: Clip, edge: 'start' | 'end' | null) => void;
}

function ClipView({ clip, asset, pxPerSec, selected, isMask, onPointerDown }: ClipViewProps) {
  const splitClip = useProjectStore((s) => s.splitClip);
  const selectClip = useUiStore((s) => s.selectClip);
  const width = Math.max(3, clip.duration * pxPerSec);
  const isVisual = clip.kind === 'text' || (asset != null && asset.kind !== 'audio');
  const fadeLeft = clip.audio.fadeIn * pxPerSec;
  const fadeRight = clip.audio.fadeOut * pxPerSec;
  const narrow = width < 34;
  const speedLabel = clip.speed !== 1 || clip.reverse ? `${clip.reverse ? '−' : ''}${clip.speed.toFixed(2)}×` : null;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const edge: 'start' | 'end' | null =
      !narrow && relX < EDGE_PX ? 'start' : !narrow && relX > rect.width - EDGE_PX ? 'end' : null;
    onPointerDown(e, clip, edge);
  };

  const cls = [
    'tl-clip',
    clip.kind === 'text' ? 'text' : asset?.kind === 'audio' ? 'audio' : 'video',
    selected ? 'selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cls}
      style={{ left: clip.start * pxPerSec, width }}
      data-clip-id={clip.id}
      onPointerDown={handlePointerDown}
      title={clip.name}
    >
      {clip.transitionIn && (
        <div
          className="tl-transition"
          style={{ width: Math.max(4, clip.transitionIn.duration * pxPerSec) }}
          title={clip.transitionIn.type}
        />
      )}
      {isVisual && clip.kind === 'media' && asset && (
        <Filmstrip asset={asset} clip={clip} width={width} height={laneHeight('video') - 18} />
      )}
      {asset?.kind === 'audio' && asset.waveform && (
        <div className="tl-waveform">
          <Waveform asset={asset} clip={clip} width={width} height={laneHeight('audio') - 6} />
        </div>
      )}
      {clip.kind === 'text' && (
        <div className="tl-text-preview">
          <TypeIcon size={11} />
          <span>{clip.text?.content?.split('\n')[0] || clip.name}</span>
        </div>
      )}
      <div className="tl-clip-name">
        {clip.kind === 'media' && asset?.kind === 'video' ? <Film size={10} /> : null}
        {isMask ? <Diamond size={10} className="tl-mask-badge" fill="currentColor" /> : null}
        {clip.kind === 'media' && asset?.kind === 'audio' ? <Music size={10} /> : null}
        <span>{clip.name}</span>
        {speedLabel && <span className="tl-speed-badge">{speedLabel}</span>}
      </div>
      {fadeLeft > 2 && <div className="tl-fade tl-fade-in" style={{ width: Math.min(fadeLeft, width) }} />}
      {fadeRight > 2 && <div className="tl-fade tl-fade-out" style={{ width: Math.min(fadeRight, width) }} />}
      {!narrow && <div className="tl-trim-handle left"><span /></div>}
      {!narrow && <div className="tl-trim-handle right"><span /></div>}
    </div>
  );
}

/** --- Track başlığı --- */
function TrackHeader({
  track,
  canDelete,
  onGripDown,
}: {
  track: Track;
  canDelete: boolean;
  onGripDown: (e: React.PointerEvent, track: Track) => void;
}) {
  const t = useT();
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const removeTrack = useProjectStore((s) => s.removeTrack);
  return (
    <div className={`tl-header ${track.kind}`} style={{ height: laneHeight(track.kind) }} data-track-id={track.id}>
      <span
        className="tl-grip"
        title={t('timeline.reorderTrack')}
        onPointerDown={(e) => onGripDown(e, track)}
      >
        <GripVertical size={13} />
      </span>
      <span className="tl-header-name">{track.name}</span>
      <div className="tl-header-actions">
        <button
          className={`icon-btn mini ${track.muted ? 'active' : ''}`}
          title={t('timeline.mute')}
          onClick={() => updateTrack(track.id, { muted: !track.muted })}
        >
          {track.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
        </button>
        {track.kind === 'video' && (
          <button
            className={`icon-btn mini ${track.hidden ? 'active' : ''}`}
            title={t('timeline.hide')}
            onClick={() => updateTrack(track.id, { hidden: !track.hidden })}
          >
            {track.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        )}
        <button
          className={`icon-btn mini ${track.locked ? 'active' : ''}`}
          title={t('timeline.lock')}
          onClick={() => updateTrack(track.id, { locked: !track.locked })}
        >
          {track.locked ? <Lock size={12} /> : <Unlock size={12} />}
        </button>
        <button
          className="icon-btn mini"
          title={t('timeline.removeTrack')}
          disabled={!canDelete}
          onClick={() => removeTrack(track.id)}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

/** Makas butonu: imleç/selection değişince canlı aktiflenir (ayrı abonelik). */
function SplitButton() {
  const t = useT();
  const currentTime = useProjectStore((s) => s.currentTime);
  const clips = useProjectStore((s) => s.clips);
  const selectedClipIds = useUiStore((s) => s.selectedClipIds);
  const enabled = selectedClipIds.some((cid) => {
    const c = clips.find((x) => x.id === cid);
    return !!c && currentTime > c.start + 0.2 && currentTime < c.start + c.duration - 0.2;
  });
  return (
    <button
      className="icon-btn"
      title={t('timeline.splitAtPlayhead')}
      disabled={!enabled}
      onClick={() => {
        const tNow = useProjectStore.getState().currentTime;
        for (const cid of useUiStore.getState().selectedClipIds) useProjectStore.getState().splitClip(cid, tNow);
      }}
    >
      <Scissors size={15} />
    </button>
  );
}

/** --- Ana panel --- */
export function TimelinePanel({ fill }: { fill?: boolean }) {
  const t = useT();
  const timelineHeight = useUiStore((s) => s.timelineHeight);
  const snap = useUiStore((s) => s.snap);
  const toggleSnap = useUiStore((s) => s.toggleSnap);
  const pxPerSec = useUiStore((s) => s.pxPerSec);
  const setPxPerSec = useUiStore((s) => s.setPxPerSec);
  const selectClip = useUiStore((s) => s.selectClip);
  const selectedClipIds = useUiStore((s) => s.selectedClipIds);

  const tracks = useProjectStore((s) => s.tracks);
  const clips = useProjectStore((s) => s.clips);
  const markers = useProjectStore((s) => s.markers);
  const settings = useProjectStore((s) => s.settings);
  const moveClip = useProjectStore((s) => s.moveClip);
  const retimeClip = useProjectStore((s) => s.retimeClip);
  const addClipFromAsset = useProjectStore((s) => s.addClipFromAsset);
  const addTextClip = useProjectStore((s) => s.addTextClip);
  const addTrack = useProjectStore((s) => s.addTrack);
  const addMarker = useProjectStore((s) => s.addMarker);
  const removeMarker = useProjectStore((s) => s.removeMarker);
  const assets = useMediaStore((s) => s.assets);

  const scrollRef = useRef<HTMLDivElement>(null);
  const headersRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [trackDrop, setTrackDrop] = useState<{ top: number; slot: number } | null>(null);
  const dragRef = useRef<null | {
    mode: 'move' | 'trim-start' | 'trim-end';
    clipId: string;
    startX: number;
    origStart: number;
    origEnd: number;
    moved: boolean;
    /** Alt+sürükleme: ilk harekette kopya oluştur, onu sürükle */
    dup: boolean;
    dupDone: boolean;
  }>(null);
  const [contentWidth, setContentWidth] = useState(1200);
  const [dropHint, setDropHint] = useState<{ trackId: string; x: number } | null>(null);

  const duration = timelineDuration(clips);
  useEffect(() => {
    const measure = () => {
      const viewW = scrollRef.current?.clientWidth ?? 800;
      setContentWidth(Math.max((duration + 6) * pxPerSec, viewW));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [duration, pxPerSec]);

  /**
   * Tekerlek: Alt = zoom (imleç altındaki zaman sabit kalır), Shift = yatay
   * kaydırma, düz tekerlek = dikey kaydırma (tarayıcı varsayılanı).
   * Pasif olmayan yerel dinleyici — preventDefault çalışması için.
   */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      if (e.altKey) {
        e.preventDefault();
        const ui = useUiStore.getState();
        const pps = ui.pxPerSec;
        const rect = innerRef.current?.getBoundingClientRect();
        const timeAt = rect ? (e.clientX - rect.left) / pps : 0;
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const next = clampish(pps * factor);
        ui.setPxPerSec(next);
        requestAnimationFrame(() => {
          el.scrollLeft = Math.max(0, timeAt * next - (e.clientX - el.getBoundingClientRect().left));
        });
      } else if (e.shiftKey) {
        e.preventDefault();
        el.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX;
      }
      // düz tekerlek: native dikey kaydırma — müdahale yok
    };
    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', onWheelNative);
  }, []);

  const quantize = useCallback(
    (time: number) => Math.max(0, Math.round(time * settings.fps) / settings.fps),
    [settings.fps],
  );

  const snapTime = useCallback(
    (time: number, excludeId: string) => {
      const result = quantize(time);
      if (!snap) return result;
      const threshold = SNAP_PX / pxPerSec;
      const targets: number[] = [0, useProjectStore.getState().currentTime];
      for (const c of clips) {
        if (c.id === excludeId) continue;
        targets.push(c.start, c.start + c.duration);
      }
      let best = result;
      let bestD = threshold;
      for (const target of targets) {
        const d = Math.abs(target - time);
        if (d < bestD) {
          bestD = d;
          best = target;
        }
      }
      return Math.max(0, best);
    },
    [snap, pxPerSec, clips, quantize],
  );

  /** Taşıma mıknatısı: klip ister BAŞI ister SONU ile hedefe yapışsın. */
  const snapMoveStart = useCallback(
    (time: number, dur: number, excludeId: string) => {
      const result = quantize(time);
      if (!snap) return result;
      const threshold = SNAP_PX / pxPerSec;
      const targets: number[] = [0, useProjectStore.getState().currentTime];
      for (const c of clips) {
        if (c.id === excludeId) continue;
        targets.push(c.start, c.start + c.duration);
      }
      let best = result;
      let bestD = threshold;
      for (const target of targets) {
        const dStart = Math.abs(target - time);
        if (dStart < bestD) {
          bestD = dStart;
          best = target;
        }
        const dEnd = Math.abs(target - (time + dur));
        if (dEnd < bestD) {
          bestD = dEnd;
          best = target - dur;
        }
      }
      return Math.max(0, best);
    },
    [snap, pxPerSec, clips, quantize],
  );

  const laneFromY = useCallback(
    (clientY: number): Track | null => {
      const lanes = innerRef.current?.querySelectorAll<HTMLDivElement>('.tl-lane');
      if (!lanes) return null;
      for (const lane of lanes) {
        const r = lane.getBoundingClientRect();
        if (clientY >= r.top && clientY <= r.bottom) {
          const id = lane.dataset.trackId ?? '';
          return tracks.find((tr) => tr.id === id) ?? null;
        }
      }
      return null;
    },
    [tracks],
  );

  const onClipDragStart = useCallback(
    (e: React.PointerEvent, clip: Clip, edge: 'start' | 'end' | null) => {
      selectClip(clip.id, e.ctrlKey || e.metaKey || e.shiftKey);
      dragRef.current = {
        mode: edge === 'start' ? 'trim-start' : edge === 'end' ? 'trim-end' : 'move',
        clipId: clip.id,
        startX: e.clientX,
        origStart: clip.start,
        origEnd: clip.start + clip.duration,
        moved: false,
        dup: e.altKey && edge === null,
        dupDone: false,
      };
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* sentetik olay */ }
      const move = (ev: PointerEvent) => {
        const d = dragRef.current;
        if (!d) return;
        const dx = (ev.clientX - d.startX) / pxPerSec;
        if (!d.moved && Math.abs(ev.clientX - d.startX) < 3) return;
        d.moved = true;
        // Alt+sürükleme: ilk harekette kopyayı oluştur, artık onu taşı
        if (d.dup && !d.dupDone) {
          d.dupDone = true;
          const copyId = useProjectStore.getState().duplicateClip(d.clipId);
          if (copyId) {
            d.clipId = copyId;
            selectClip(copyId);
          }
        }
        if (d.mode === 'move') {
          const lane = laneFromY(ev.clientY);
          const cur = useProjectStore.getState().clips.find((c) => c.id === d.clipId);
          moveClip(d.clipId, {
            trackId: lane?.id ?? cur?.trackId ?? '',
            start: snapMoveStart(d.origStart + dx, d.origEnd - d.origStart, d.clipId),
          });
        } else if (d.mode === 'trim-start') {
          retimeClip(d.clipId, 'start', snapTime(d.origStart + dx, d.clipId));
        } else {
          retimeClip(d.clipId, 'end', snapTime(d.origEnd + dx, d.clipId));
        }
      };
      const up = () => {
        dragRef.current = null;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [pxPerSec, selectClip, moveClip, retimeClip, snapTime, snapMoveStart, laneFromY],
  );

  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/x-ev-asset')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const lane = laneFromY(e.clientY);
    const rect = innerRef.current?.getBoundingClientRect();
    if (lane && rect) {
      setDropHint({ trackId: lane.id, x: quantize((e.clientX - rect.left) / pxPerSec) * pxPerSec });
    }
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropHint(null);
    const assetId = e.dataTransfer.getData('application/x-ev-asset');
    if (!assetId) return;
    const lane = laneFromY(e.clientY);
    const rect = innerRef.current?.getBoundingClientRect();
    if (!lane || !rect) return;
    const time = snapTime((e.clientX - rect.left) / pxPerSec, '');
    const newId = addClipFromAsset(assetId, lane.id, time);
    if (newId) selectClip(newId);
  };

  /** Metin klibi ekle: imleç noktasına yerleştir, görünüme kaydır, yazı alanını odakla. */
  const addTextHere = () => {
    const id = addTextClip();
    if (id) {
      selectClip(id);
      const tNow = useProjectStore.getState().currentTime;
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) el.scrollLeft = Math.max(0, tNow * pxPerSec - el.clientWidth * 0.4);
        setTimeout(() => {
          const ta = document.querySelector('.inspector-body textarea');
          (ta as HTMLTextAreaElement | null)?.focus();
        }, 150);
      });
    }
  };

  /**
   * Track'i tutamaçtan sürükleyerek KENDİ TÜRÜ içinde yeniden sıralar.
   * Fare konumundan hedef slot hesaplanır; ekleme çizgisi gösterilir.
   */
  const onTrackGripDown = useCallback((e: React.PointerEvent, track: Track) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const container = headersRef.current;
    if (!container) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* sentetik olay */ }

    /** Aynı tür başlıklar üzerinden hedef slot + çizgi konumu (konteynere göre). */
    const computeSlot = (clientY: number): { slot: number; top: number } => {
      const all = useProjectStore.getState().tracks;
      const kids = Array.from(container.children) as HTMLElement[];
      const contTop = container.getBoundingClientRect().top;
      const same: HTMLElement[] = [];
      all.forEach((tr, i) => {
        if (tr.kind === track.kind && kids[i]) same.push(kids[i]);
      });
      let slot = same.length;
      let lineTop = 0;
      for (let i = 0; i < same.length; i++) {
        const r = same[i].getBoundingClientRect();
        if (clientY < r.top + r.height / 2) {
          slot = i;
          lineTop = r.top - contTop;
          break;
        }
        lineTop = r.bottom - contTop;
      }
      return { slot, top: lineTop };
    };

    const move = (ev: PointerEvent) => {
      const { slot, top } = computeSlot(ev.clientY);
      setTrackDrop((prev) => (prev && prev.slot === slot && prev.top === top ? prev : { slot, top }));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setTrackDrop(null);
      const { slot } = computeSlot(ev.clientY);
      useProjectStore.getState().moveTrackToSlot(track.id, slot);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    const first = computeSlot(e.clientY);
    setTrackDrop({ slot: first.slot, top: first.top });
  }, []);

  const videoTrackCount = tracks.filter((tr) => tr.kind === 'video').length;
  const audioTrackCount = tracks.filter((tr) => tr.kind === 'audio').length;

  return (
    <>
      <TimelineDivider />
      <section className="panel timeline" style={fill ? { height: '100%' } : { height: timelineHeight }} aria-label={t('timeline.title')}>
        <div className="panel-header">
          <span className="panel-title">{t('timeline.title')}</span>
          <div className="spacer" />
          <button className="icon-btn" onClick={addTextHere} title={t('topbar.addText')} aria-label={t('topbar.addText')}>
            <TypeIcon size={15} />
          </button>
          <div className="topbar-sep" />
          <SplitButton />
          <button className='icon-btn wide' title={t('timeline.addMarker')} onClick={() => addMarker(useProjectStore.getState().currentTime)}><Diamond size={13} /></button>
          <button className={`icon-btn ${snap ? 'active' : ''}`} title={t('timeline.tool.snap')} onClick={toggleSnap}>
            <Magnet size={15} />
          </button>
          <div className="topbar-sep" />
          <button className="icon-btn wide" title={t('timeline.addVideoTrack')} onClick={() => addTrack('video')}>
            <Film size={14} />
            <Plus size={10} />
          </button>
          <button className="icon-btn wide" title={t('timeline.addAudioTrack')} onClick={() => addTrack('audio')}>
            <Music size={14} />
            <Plus size={10} />
          </button>
          <div className="topbar-sep" />
          <button className="icon-btn" title={t('timeline.zoomIn')} onClick={() => setPxPerSec(pxPerSec * 1.3)}>
            <ZoomIn size={15} />
          </button>
          <button className="icon-btn" title={t('timeline.zoomOut')} onClick={() => setPxPerSec(pxPerSec / 1.3)}>
            <ZoomOut size={15} />
          </button>
        </div>
        <div className="tl-body">
          <div className="tl-left" style={{ width: HEADER_W }}>
            <div style={{ height: RULER_H, borderBottom: '1px solid var(--border)', flexShrink: 0 }} />
            <div className="tl-headers" ref={headersRef}>
              {tracks.map((tr) => (
                <TrackHeader
                  key={tr.id}
                  track={tr}
                  canDelete={tr.kind === 'video' ? videoTrackCount > 1 : audioTrackCount > 1}
                  onGripDown={onTrackGripDown}
                />
              ))}
              {trackDrop && <div className="tl-reorder-hint" style={{ top: trackDrop.top - 1 }} />}
            </div>
          </div>
          <div
            className="tl-scroll"
            ref={scrollRef}
            onScroll={(e) => {
              if (headersRef.current) headersRef.current.scrollTop = e.currentTarget.scrollTop;
            }}
            onDragOver={onDragOver}
            onDragLeave={() => setDropHint(null)}
            onDrop={onDrop}
          >
            <div
              className="tl-inner"
              ref={innerRef}
              style={{ width: contentWidth }}
              onPointerDown={(e) => {
                const target = e.target as HTMLElement;
                if (target === e.currentTarget || target.classList.contains('tl-lane')) {
                  selectClip(null);
                }
              }}
            >
              <Ruler
                width={contentWidth}
                pxPerSec={pxPerSec}
                markers={markers}
                snap={snap}
                edges={clips.flatMap((c) => [c.start, c.start + c.duration])}
                onMarkerSeek={(tt) => playback.seek(tt)}
                onMarkerRemove={(id) => removeMarker(id)}
              />
              {tracks.map((tr) => (
                <div
                  key={tr.id}
                  data-track-id={tr.id}
                  className={`tl-lane ${tr.kind}`}
                  style={{ height: laneHeight(tr.kind) }}
                >
                  {dropHint?.trackId === tr.id && <div className="tl-drop-hint" style={{ left: dropHint.x }} />}
                  {clips
                    .filter((c) => c.trackId === tr.id)
                    .sort((a, b) => a.start - b.start)
                    .map((clip) => (
                      <ClipView
                        key={clip.id}
                        clip={clip}
                        asset={assets.find((a) => a.id === clip.assetId)}
                        pxPerSec={pxPerSec}
                        selected={selectedClipIds.includes(clip.id)}
                        isMask={clips.some((x) => x.maskClipId === clip.id)}
                        onPointerDown={onClipDragStart}
                      />
                    ))}
                </div>
              ))}
              <Playhead pxPerSec={pxPerSec} scrollRef={scrollRef} />
            </div>
          </div>
        </div>
        <div className="tl-statusbar">
          <span>{clips.length} {t('timeline.clips')}</span>
          <span>{t('timeline.duration')}: {duration.toFixed(2)} sn</span>
          {markers.length > 0 && (
            <span>{markers.length} {t('timeline.markers')}</span>
          )}
        </div>
      </section>
    </>
  );
}

/** Zaman çizgisi panelini yüksekliğine göre yeniden boylandıran ayırıcı. */
function TimelineDivider() {
  const setTimelineHeight = useUiStore((s) => s.setTimelineHeight);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    try { el.setPointerCapture(e.pointerId); } catch { /* yok say */ }
    el.classList.add('dragging');
    const move = (ev: PointerEvent) => {
      setTimelineHeight(window.innerHeight - ev.clientY);
    };
    const up = () => {
      el.classList.remove('dragging');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return <div className="timeline-divider" onPointerDown={onPointerDown} role="separator" />;
}
