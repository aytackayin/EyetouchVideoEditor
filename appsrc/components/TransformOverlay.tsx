import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Clip, MediaAsset, ProjectSettings } from '../types';
import { effectiveValues, upsertKeyframe } from '../utils';
import { useProjectStore } from '../state/projectStore';
import { useMediaStore } from '../state/mediaStore';
import { useUiStore } from '../state/uiStore';

/**
 * Önizleme üzerinde seçili klibin dönüşüm çerçevesi.
 * Mıknatıs hedefleri (taşımada):
 * - Canvas kenarları (sol/sağ/üst/alt) ve canvas merkezi
 * - Diğer görünen kliplerin kenarları ve merkezleri
 * Ölçekleme: ×1'e ve (dönüş 0 iken) canvas'a tam oturmaya yapışır.
 * Döndürme: 0/±90/180'e yapışır. Çift tık: dönüşümü sıfırlar.
 */

const HANDLE = 9;
const SNAP_PX_OVERLAY = 7;

/**
 * Önizlemede dönüşüm çerçevesi şu an görünür mü? (tek seçili klip, görünür
 * video track, imleç klibin üzerinde, oynatmıyor) — canvas boyut kulplarının
 * klip kulplarıyla çakışmaması için kullanılır.
 */
export function isOverlayActive(
  selectedClipIds: string[],
  clips: Clip[],
  tracks: Array<{ id: string; kind: string; hidden: boolean }>,
  currentTime: number,
  isPlaying: boolean,
): boolean {
  if (isPlaying || selectedClipIds.length !== 1) return false;
  const clip = clips.find((c) => c.id === selectedClipIds[0]);
  if (!clip) return false;
  if (clip.kind !== 'text' && !clip.assetId) return false;
  const track = tracks.find((tr) => tr.id === clip.trackId);
  if (!track || track.hidden || track.kind !== 'video') return false;
  return currentTime >= clip.start - 0.001 && currentTime < clip.start + clip.duration;
}

/**
 * Önizlemede verilen canvas noktasının altındaki en üstteki görünen klip
 * (track sırası: dizide önceki = üstte). Yoksa null. Dönmüş kliplerde
 * nokta klibin merkez etrafında ters döndürülüp öyle kutu testi yapılır.
 */
export function pickPreviewClip(
  clips: Clip[],
  tracks: Array<{ id: string; kind: string; hidden: boolean }>,
  assets: MediaAsset[],
  settings: ProjectSettings,
  t: number,
  cx: number,
  cy: number,
): string | null {
  for (const tr of tracks) {
    if (tr.kind !== 'video' || tr.hidden) continue;
    for (const c of clips) {
      if (c.trackId !== tr.id) continue;
      if (t < c.start - 0.001 || t >= c.start + c.duration) continue;
      if (c.kind === 'text' && !c.text?.content) continue;
      if (c.kind === 'media' && !c.assetId) continue;
      const g = clipGeom(c, assets, settings, t);
      const dx = cx - g.cx;
      const dy = cy - g.cy;
      const a = (-g.eff.rotation * Math.PI) / 180;
      const lx = dx * Math.cos(a) - dy * Math.sin(a);
      const ly = dx * Math.sin(a) + dy * Math.cos(a);
      if (Math.abs(lx) <= g.w / 2 && Math.abs(ly) <= g.h / 2) return c.id;
    }
  }
  return null;
}

/** Klibin proje uzayındaki kutusu — canvas koordinatları (0..W, 0..H). */
export function clipGeom(clip: Clip, assets: MediaAsset[], settings: ProjectSettings, t: number) {
  const eff = effectiveValues(clip, t);
  let baseW: number;
  let baseH: number;
  if (clip.kind === 'text') {
    const fs = clip.text?.fontSize ?? 96;
    const content = clip.text?.content || '·';
    const charsPerLine = Math.max(...content.split('\n').map((l) => l.length), 1);
    baseW = Math.min(settings.width * 0.98, charsPerLine * fs * 0.62);
    baseH = content.split('\n').length * fs * 1.4;
  } else {
    const asset = assets.find((a) => a.id === clip.assetId);
    const natW = asset?.width || 16;
    const natH = asset?.height || 9;
    const crop = clip.transform.crop;
    const sw = natW * (1 - crop.left - crop.right);
    const sh = natH * (1 - crop.top - crop.bottom);
    const fit = Math.min(settings.width / sw, settings.height / sh);
    baseW = sw * fit;
    baseH = sh * fit;
  }
  const w = baseW * eff.scale;
  const h = baseH * eff.scale;
  const cx = settings.width / 2 + eff.x;
  const cy = settings.height / 2 + eff.y;
  return { cx, cy, w, h, x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2, eff };
}

export function TransformOverlay({
  frameSize,
  settings,
}: {
  frameSize: { w: number; h: number } | null;
  settings: ProjectSettings;
}) {
  const clips = useProjectStore((s) => s.clips);
  const tracks = useProjectStore((s) => s.tracks);
  const updateClip = useProjectStore((s) => s.updateClip);
  const currentTime = useProjectStore((s) => s.currentTime);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const selectedClipIds = useUiStore((s) => s.selectedClipIds);
  const assets = useMediaStore((s) => s.assets);
  /** Kılavuz çizgileri — canvas uzayında x/y (null = yok) */
  const [guides, setGuides] = useState<{ v: number | null; h: number | null }>({ v: null, h: null });
  const [mode, setMode] = useState<'none' | 'move' | 'scale' | 'rotate'>('none');
  const frameRef = useRef<HTMLDivElement | null>(null);

  const clipId = selectedClipIds.length === 1 ? selectedClipIds[0] : null;
  const clip = clipId ? clips.find((c) => c.id === clipId) ?? null : null;

  const geom = useMemo(() => {
    if (!clip) return null;
    if (clip.kind !== 'text' && !clip.assetId) return null;
    const track = tracks.find((tr) => tr.id === clip.trackId);
    if (!track || track.hidden || track.kind !== 'video') return null;
    if (currentTime < clip.start - 0.001 || currentTime >= clip.start + clip.duration) return null;
    return clipGeom(clip, assets, settings, currentTime);
  }, [clip, settings, currentTime, tracks, assets]);

  /** Aynı anda görünen diğer kliplerin kutuları (proje uzayı) */
  const otherBoxes = useMemo(() => {
    if (!clip) return [];
    const list: Array<{ cx: number; cy: number; x0: number; x1: number; y0: number; y1: number }> = [];
    for (const tr of tracks) {
      if (tr.kind !== 'video' || tr.hidden) continue;
      for (const c of clips) {
        if (c.id === clip.id || c.trackId !== tr.id) continue;
        if (currentTime < c.start - 0.001 || currentTime >= c.start + c.duration) continue;
        if (c.kind === 'text' && !c.text?.content) continue;
        if (c.kind === 'media' && !c.assetId) continue;
        list.push(clipGeom(c, assets, settings, currentTime));
      }
    }
    return list;
  }, [clip, clips, tracks, assets, settings, currentTime]);

  const patchTransform = useCallback(
    (patch: Partial<Clip['transform']>) => {
      if (!clip) return;
      const hasKfs = Object.keys(clip.keyframes ?? {}).some((k) => (clip.keyframes ?? {})[k as 'x']?.length);
      if (hasKfs) {
        const localT = Math.max(0, Math.min(clip.duration, currentTime - clip.start));
        const kfs = { ...(clip.keyframes ?? {}) };
        const base = { ...clip.transform, ...patch };
        for (const key of Object.keys(patch) as Array<'x' | 'y' | 'scale' | 'rotation' | 'opacity' | 'crop'>) {
          if (key === 'x' || key === 'y' || key === 'scale' || key === 'rotation' || key === 'opacity') {
            kfs[key] = upsertKeyframe(clip, key, localT, base[key])[key];
          }
        }
        updateClip(clip.id, { transform: base, keyframes: kfs }, true);
        return;
      }
      updateClip(clip.id, { transform: { ...clip.transform, ...patch } }, true);
    },
    [clip, currentTime, updateClip],
  );

  /** Taşıma mıknatısı: canvas kenar/merkez + diğer kliplerin kenar/merkezlerine yapıştır. */
  const snapMove = useCallback(
    (nx: number, ny: number, w: number, h: number) => {
      if (!frameSize) return { x: nx, y: ny, v: null as number | null, h: null as number | null };
      const k = frameSize.w / settings.width;
      const th = SNAP_PX_OVERLAY / k;
      const W = settings.width;
      const H = settings.height;

      const xT: Array<{ v: number; at: number }> = [
        { v: 0, at: W / 2 },                    // merkez → canvas merkezi
        { v: -W / 2 + w / 2, at: 0 },           // sol → canvas solu
        { v: W / 2 - w / 2, at: W },            // sağ → canvas sağı
        { v: w / 2, at: W / 2 },                // sol kenar → canvas merkezi
        { v: -w / 2, at: W / 2 },               // sağ kenar → canvas merkezi
      ];
      const yT: Array<{ v: number; at: number }> = [
        { v: 0, at: H / 2 },
        { v: -H / 2 + h / 2, at: 0 },
        { v: H / 2 - h / 2, at: H },
        { v: h / 2, at: H / 2 },                // üst kenar → canvas merkezi
        { v: -h / 2, at: H / 2 },               // alt kenar → canvas merkezi
      ];
      for (const o of otherBoxes) {
        xT.push(
          { v: o.cx - W / 2, at: o.cx },
          { v: o.x1 - W / 2 + w / 2, at: o.x1 },
          { v: o.x0 - W / 2 - w / 2, at: o.x0 },
          { v: o.x0 - W / 2 + w / 2, at: o.x0 },
          { v: o.x1 - W / 2 - w / 2, at: o.x1 },
          { v: o.cx - W / 2 + w / 2, at: o.cx }, // sol kenar → diğerinin merkezi
          { v: o.cx - W / 2 - w / 2, at: o.cx }, // sağ kenar → diğerinin merkezi
        );
        yT.push(
          { v: o.cy - H / 2, at: o.cy },
          { v: o.y1 - H / 2 + h / 2, at: o.y1 },
          { v: o.y0 - H / 2 - h / 2, at: o.y0 },
          { v: o.y0 - H / 2 + h / 2, at: o.y0 },
          { v: o.y1 - H / 2 - h / 2, at: o.y1 },
          { v: o.cy - H / 2 + h / 2, at: o.cy }, // üst kenar → diğerinin merkezi
          { v: o.cy - H / 2 - h / 2, at: o.cy }, // alt kenar → diğerinin merkezi
        );
      }
      let bx = nx;
      let bxd = th;
      let bv: number | null = null;
      for (const t of xT) {
        const d = Math.abs(t.v - nx);
        if (d < bxd) {
          bxd = d;
          bx = t.v;
          bv = t.at;
        }
      }
      let by = ny;
      let byd = th;
      let bh: number | null = null;
      for (const t of yT) {
        const d = Math.abs(t.v - ny);
        if (d < byd) {
          byd = d;
          by = t.v;
          bh = t.at;
        }
      }
      return { x: Math.round(bx), y: Math.round(by), v: bv, h: bh };
    },
    [frameSize, settings, otherBoxes],
  );

  const onBodyDown = (e: React.PointerEvent) => {
    if (!clip || !frameSize || !geom) return;
    e.stopPropagation();
    e.preventDefault();
    // Tıklanan noktanın ÜSTÜNDE başka klip varsa seçimi ona devret —
    // yoksa alttaki seçili klibin çerçevesi üstteki klibi seçilemez kılar
    const frameEl = frameRef.current;
    const rect = frameEl?.getBoundingClientRect();
    if (rect) {
      const k = frameSize.w / settings.width;
      const px = (e.clientX - rect.left) / k;
      const py = (e.clientY - rect.top) / (frameSize.h / settings.height);
      const top = pickPreviewClip(clips, tracks, assets, settings, currentTime, px, py);
      if (top && top !== clip.id) {
        useUiStore.getState().selectClip(top, e.ctrlKey || e.metaKey || e.shiftKey);
        return;
      }
    }
    setMode('move');
    const start = { x: e.clientX, y: e.clientY, ox: clip.transform.x, oy: clip.transform.y };
    const k = frameSize.w / settings.width;
    const move = (ev: PointerEvent) => {
      const nx = start.ox + (ev.clientX - start.x) / k;
      const ny = start.oy + (ev.clientY - start.y) / k;
      const snapped = snapMove(nx, ny, geom.w, geom.h);
      setGuides({ v: snapped.v, h: snapped.h });
      patchTransform({ x: snapped.x, y: snapped.y });
    };
    const up = () => {
      setMode('none');
      setGuides({ v: null, h: null });
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onCornerDown = (e: React.PointerEvent) => {
    if (!clip || !frameSize || !geom) return;
    e.stopPropagation();
    e.preventDefault();
    setMode('scale');
    const frameEl = frameRef.current;
    if (!frameEl) return;
    const rect = frameEl.getBoundingClientRect();
    const k = frameSize.w / settings.width;
    const cxPx = rect.left + geom.cx * k;
    const cyPx = rect.top + geom.cy * (frameSize.h / settings.height);
    const startDist = Math.hypot(e.clientX - cxPx, e.clientY - cyPx);
    const startScale = geom.eff.scale;
    const startRotation = geom.eff.rotation;
    const w0 = geom.w / startScale;
    const h0 = geom.h / startScale;
    const cx = geom.cx;
    const cy = geom.cy;
    const move = (ev: PointerEvent) => {
      const dist = Math.hypot(ev.clientX - cxPx, ev.clientY - cyPx);
      let s = (dist / Math.max(4, startDist)) * startScale;
      if (Math.abs(s - 1) < 0.06) s = 1;
      // Tam oturma mıknatısı (dönüş ~0 iken): kenar canvas kenarına değince yapış
      if (Math.abs(startRotation) < 0.5) {
        const th = SNAP_PX_OVERLAY / k;
        const W = settings.width;
        const H = settings.height;
        const w = w0 * s;
        const h = h0 * s;
        const fitW = Math.min(2 * (W - cx), 2 * cx) / w0;
        const fitH = Math.min(2 * (H - cy), 2 * cy) / h0;
        if (Math.abs(w0 * fitW - w) < th * 2.5) s = fitW;
        else if (Math.abs(h0 * fitH - h) < th * 2.5) s = fitH;
      }
      s = Math.max(0.05, Math.min(5, s));
      patchTransform({ scale: Math.round(s * 100) / 100 });
    };
    const up = () => {
      setMode('none');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onRotateDown = (e: React.PointerEvent) => {
    if (!clip || !frameSize || !geom) return;
    e.stopPropagation();
    e.preventDefault();
    setMode('rotate');
    const frameEl = frameRef.current;
    if (!frameEl) return;
    const rect = frameEl.getBoundingClientRect();
    const k = frameSize.w / settings.width;
    const cxPx = rect.left + geom.cx * k;
    const cyPx = rect.top + geom.cy * (frameSize.h / settings.height);
    const startAngle = (Math.atan2(e.clientY - cyPx, e.clientX - cxPx) * 180) / Math.PI;
    const startRot = geom.eff.rotation;
    const move = (ev: PointerEvent) => {
      const angle = (Math.atan2(ev.clientY - cyPx, ev.clientX - cxPx) * 180) / Math.PI;
      let rot = startRot + (angle - startAngle);
      rot = ((rot % 360) + 540) % 360 - 180;
      for (const snapDeg of [-180, -90, 0, 90, 180]) {
        if (Math.abs(rot - snapDeg) < 4) rot = snapDeg;
      }
      patchTransform({ rotation: Math.round(rot) });
    };
    const up = () => {
      setMode('none');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  if (!geom || !clip || !frameSize || isPlaying) return null;

  const k = frameSize.w / settings.width;
  const box = {
    left: geom.x0 * k,
    top: geom.y0 * k,
    width: geom.w * k,
    height: geom.h * k,
  };
  const rotated = Math.abs(geom.eff.rotation % 180) > 4;

  const handles: Array<{ id: string; style: React.CSSProperties; cursor: string }> = [
    { id: 'nw', style: { left: -HANDLE / 2, top: -HANDLE / 2 }, cursor: 'nwse-resize' },
    { id: 'ne', style: { right: -HANDLE / 2, top: -HANDLE / 2 }, cursor: 'nesw-resize' },
    { id: 'sw', style: { left: -HANDLE / 2, bottom: -HANDLE / 2 }, cursor: 'nesw-resize' },
    { id: 'se', style: { right: -HANDLE / 2, bottom: -HANDLE / 2 }, cursor: 'nwse-resize' },
  ];

  // Döndürme bölgeleri: köşe kulplarının hemen dışında, GÖRÜNMEZ —
  // yalnızca fare oraya gelince imleç döndürme ikonuna dönüşür
  const ZONE = 18;
  const zoneOff = -(HANDLE + 6) - ZONE / 2;
  const rotZones: Array<{ id: string; style: React.CSSProperties }> = [
    { id: 'nw', style: { left: zoneOff, top: zoneOff, width: ZONE, height: ZONE } },
    { id: 'ne', style: { right: zoneOff, top: zoneOff, width: ZONE, height: ZONE } },
    { id: 'sw', style: { left: zoneOff, bottom: zoneOff, width: ZONE, height: ZONE } },
    { id: 'se', style: { right: zoneOff, bottom: zoneOff, width: ZONE, height: ZONE } },
  ];

  return (
    <div ref={frameRef} className="tf-overlay-root">
      {guides.v !== null && <div className="tf-guide-v" style={{ left: guides.v * k }} />}
      {guides.h !== null && <div className="tf-guide-h" style={{ top: guides.h * (frameSize.h / settings.height) }} />}
      <div
        className={`tf-box ${mode !== 'none' ? 'active' : ''}`}
        style={{
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          transform: geom.eff.rotation !== 0 ? `rotate(${geom.eff.rotation}deg)` : undefined,
        }}
        onPointerDown={onBodyDown}
        onDoubleClick={() =>
          updateClip(clip.id, {
            transform: { ...clip.transform, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
            keyframes: undefined,
          })
        }
      >
        {rotZones.map((z) => (
          <div key={'rz-' + z.id} className="tf-rotate-zone" style={z.style} onPointerDown={onRotateDown} />
        ))}
        {handles.map((h) => (
          <div
            key={h.id}
            className="tf-handle"
            style={{ ...h.style, cursor: rotated ? 'crosshair' : h.cursor }}
            onPointerDown={onCornerDown}
          />
        ))}
        <div className="tf-label">
          {geom.eff.scale.toFixed(2)}×{geom.eff.rotation !== 0 ? ` · ${Math.round(geom.eff.rotation)}°` : ''}
        </div>
      </div>
    </div>
  );
}
