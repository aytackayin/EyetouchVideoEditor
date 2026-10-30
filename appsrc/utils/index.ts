import type { Clip, EasingType, Keyframe, KeyframableProp } from '../types';
import { PROP_DEFAULTS } from '../types';

/** Benzersiz kimlik üretici (tüm id'ler için ortak). */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Debounce — yüksek frekanslı kayıtlar (playhead vb.) için. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** saniye → HH:MM:SS:FF zaman kodu */
export function timecode(seconds: number, fps: number): string {
  const clamped = Math.max(0, seconds || 0);
  const f = Math.floor((clamped % 1) * fps);
  const s = Math.floor(clamped) % 60;
  const m = Math.floor(clamped / 60) % 60;
  const h = Math.floor(clamped / 3600);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)}:${p(f)}`;
}

/** saniye → kompakt süre etiketi (1:04 / 12:03:55) */
export function durationLabel(seconds: number): string {
  const s = Math.floor(seconds || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
}

// --- Keyframe değerlendirme ---

function easeValue(type: EasingType, t: number): number {
  if (type === 'easeIn') return t * t;
  if (type === 'easeOut') return 1 - (1 - t) * (1 - t);
  return t;
}

/** Bir özelliğin klibe yerel t anındaki değerini keyframe'lerle hesaplar. */
export function evalKeyframed(clip: Clip, prop: KeyframableProp, localT: number, base: number): number {
  const kfs = clip.keyframes?.[prop];
  if (!kfs || kfs.length === 0) return base;
  const sorted = [...kfs].sort((a, b) => a.t - b.t);
  const t = Math.max(0, Math.min(clip.duration, localT));
  if (t <= sorted[0].t) return sorted[0].v;
  if (t >= sorted[sorted.length - 1].t) return sorted[sorted.length - 1].v;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = Math.max(0.0001, b.t - a.t);
      const p = (t - a.t) / span;
      return a.v + (b.v - a.v) * easeValue(b.ease, p);
    }
  }
  return base;
}

/** t anında etkili transform + ses değerleri (keyframe uygulanmış). */
export interface EffectiveClip {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  volume: number;
}

export function effectiveValues(clip: Clip, globalT: number): EffectiveClip {
  const localT = globalT - clip.start;
  const tr = clip.transform;
  return {
    x: evalKeyframed(clip, 'x', localT, tr.x),
    y: evalKeyframed(clip, 'y', localT, tr.y),
    scale: evalKeyframed(clip, 'scale', localT, tr.scale),
    rotation: evalKeyframed(clip, 'rotation', localT, tr.rotation),
    opacity: evalKeyframed(clip, 'opacity', localT, tr.opacity),
    volume: evalKeyframed(clip, 'volume', localT, clip.audio.volume),
  };
}

/** Playhead'e en yakın keyframe'i güncelle; yoksa ekle. */
export function upsertKeyframe(clip: Clip, prop: KeyframableProp, localT: number, v: number): NonNullable<Clip['keyframes']> {
  const kfs = [...(clip.keyframes?.[prop] ?? [])];
  const tol = 1 / 60;
  const existing = kfs.find((k) => Math.abs(k.t - localT) < tol);
  if (existing) {
    existing.v = v;
  } else {
    kfs.push({ t: Math.max(0, Math.min(clip.duration, localT)), v, ease: 'linear' });
  }
  kfs.sort((a, b) => a.t - b.t);
  return { ...(clip.keyframes ?? {}), [prop]: kfs };
}

/** .cube LUT dosyasını çözümle → { size, data (RGB float 0..1) } */
export function parseCubeLUT(text: string): { size: number; data: Float32Array } | null {
  try {
    let size = 0;
    const values: number[] = [];
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      if (line.startsWith('LUT_3D_SIZE')) {
        size = parseInt(line.split(/\s+/)[1], 10);
        continue;
      }
      if (line.startsWith('LUT_1D_SIZE') || line.startsWith('DOMAIN_')) continue;
      const parts = line.split(/\s+/).map(Number);
      if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
        values.push(parts[0], parts[1], parts[2]);
      }
    }
    if (!size || values.length !== size * size * size * 3) return null;
    return { size, data: new Float32Array(values) };
  } catch {
    return null;
  }
}

export { PROP_DEFAULTS };
export type { Keyframe, KeyframableProp };
