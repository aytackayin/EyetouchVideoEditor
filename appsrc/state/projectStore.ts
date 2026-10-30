import { create } from 'zustand';
import type {
  Clip,
  MediaAsset,
  ProjectDoc,
  ProjectSettings,
  Track,
  TrackKind,
  Marker,
} from '../types';
import {
  DEFAULT_TEXT,
  IMAGE_CLIP_DEFAULT_DURATION,
  MIN_CLIP_DURATION,
  NEUTRAL_AUDIO,
  NEUTRAL_CHROMA,
  NEUTRAL_COLOR,
  NEUTRAL_MASK,
  NEUTRAL_TRANSFORM,
} from '../types';
import { loadProjectDoc, saveProjectDoc } from '../media/storage';
import { useMediaStore } from './mediaStore';
import { uid, debounce } from '../utils';

/**
 * Proje durumu — her değişiklikte IndexedDB'ye otomatik yazılır.
 * Undo/redo: past/future yığınlarında belge anlık görüntüleri tutulur.
 */
interface DocSnapshot {
  settings: ProjectSettings;
  tracks: Track[];
  clips: Clip[];
  markers: Marker[];
}

interface ProjectState {
  settings: ProjectSettings;
  tracks: Track[];
  clips: Clip[];
  markers: Marker[];
  currentTime: number;
  isPlaying: boolean;
  restored: boolean;
  past: DocSnapshot[];
  future: DocSnapshot[];

  setSettings: (patch: Partial<ProjectSettings>) => void;
  setCurrentTime: (t: number) => void;
  setPlaying: (p: boolean) => void;

  addClipFromAsset: (assetId: string, trackId?: string, start?: number) => string | null;
  addTextClip: (start?: number, focusText?: boolean) => string | null;
  moveClip: (id: string, to: { trackId: string; start: number }) => void;
  trimClip: (id: string, edge: 'start' | 'end', edgeTime: number) => void;
  /** Kenar sürükleme = yeniden zamanlama: süre değişir, kaynak penceresi sabit kalır (kısalt → hızlan, uzat → slow-mo). Görsel/metinde klasik kırpma. */
  retimeClip: (id: string, edge: 'start' | 'end', edgeTime: number) => void;
  /** Hızı ayarlar; kaynak penceresi sabit → süre otomatik uyum sağlar. */
  setClipSpeed: (id: string, speed: number) => void;
  splitClip: (id: string, at: number) => void;
  splitSelectedAtPlayhead: () => void;
  removeClips: (ids: string[]) => void;
  /** Seçilen klibi bir hedefe MASKE KLİBİ olarak bağlar (null = bağlantıyı kes). */
  attachMaskClip: (maskId: string, targetId: string | null) => void;
  /** Klibin birebir kopyasını oluşturur (yeni id); konum taşımayla belirlenir. */
  duplicateClip: (id: string) => string | null;
  updateClip: (id: string, patch: Partial<Clip>, soft?: boolean) => void;
  updateTrack: (id: string, patch: Partial<Track>) => void;
  addTrack: (kind: TrackKind) => void;
  removeTrack: (id: string) => void;
  /** Track'i kendi türü içinde `slot`. konuma taşır (0 = en üst). */
  moveTrackToSlot: (id: string, slot: number) => void;

  addMarker: (t: number) => void;
  removeMarker: (id: string) => void;

  detachAudio: (clipId: string) => string | null;

  loadDocument: (doc: { settings: ProjectSettings; tracks: Track[]; clips: Clip[]; markers?: Marker[] }) => string[];
  newDocument: () => void;

  undo: () => void;
  redo: () => void;

  restore: () => Promise<void>;
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  name: '',
  width: 1920,
  height: 1080,
  fps: 30,
};

export function defaultTracks(): Track[] {
  const track = (kind: TrackKind, name: string): Track => ({
    id: uid(),
    kind,
    name,
    muted: false,
    locked: false,
    hidden: false,
  });
  return [track('video', 'V2'), track('video', 'V1'), track('audio', 'A1')];
}

function snapshot(s: ProjectState): ProjectDoc {
  return {
    settings: s.settings,
    tracks: s.tracks,
    clips: s.clips,
    markers: s.markers,
    currentTime: s.currentTime,
    updatedAt: Date.now(),
  };
}

function docSnapshot(s: ProjectState): DocSnapshot {
  return {
    settings: structuredClone(s.settings),
    tracks: structuredClone(s.tracks),
    clips: structuredClone(s.clips),
    markers: structuredClone(s.markers),
  };
}

const persistNow = () => saveProjectDoc(snapshot(useProjectStore.getState()));
const persistDebounced = debounce(persistNow, 300);

export function timelineDuration(clips: Clip[]): number {
  return clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
}

function assetDuration(asset: MediaAsset): number {
  return asset.kind === 'image'
    ? IMAGE_CLIP_DEFAULT_DURATION
    : Math.max(MIN_CLIP_DURATION, asset.duration);
}

/**
 * İstenen başlangıcı aynı track'teki boş aralığa sıkıştırır (çakışma yok).
 */
function clampIntoFreeGap(
  clips: Clip[],
  movingId: string,
  trackId: string,
  desired: number,
  dur: number,
): number {
  const others = clips
    .filter((c) => c.trackId === trackId && c.id !== movingId)
    .sort((a, b) => a.start - b.start);
  const gaps: Array<[number, number]> = [];
  let cursor = 0;
  for (const o of others) {
    if (o.start - cursor > 0.0001) gaps.push([cursor, o.start]);
    cursor = Math.max(cursor, o.start + o.duration);
  }
  gaps.push([cursor, Infinity]);
  for (const [g0, g1] of gaps) {
    const fits = dur <= g1 - g0;
    if (desired >= g0 - 0.0001 && desired <= g1 && fits) {
      return Math.max(g0, desired);
    }
  }
  let best = 0;
  let bestDist = Infinity;
  for (const [g0, g1] of gaps) {
    if (!(dur <= g1 - g0)) continue;
    const clamped = Math.max(g0, Math.min(desired, g1 - dur));
    const d = Math.abs(clamped - desired);
    if (d < bestDist) {
      bestDist = d;
      best = clamped;
    }
  }
  return Math.max(0, best);
}

function trackKindForAsset(asset: MediaAsset): TrackKind {
  return asset.kind === 'audio' ? 'audio' : 'video';
}

function makeMediaClip(asset: MediaAsset, trackId: string, start: number): Clip {
  return {
    id: uid(),
    trackId,
    assetId: asset.id,
    kind: 'media',
    name: asset.name,
    start,
    duration: assetDuration(asset),
    srcIn: 0,
    speed: 1,
    reverse: false,
    transform: structuredClone(NEUTRAL_TRANSFORM),
    color: { ...NEUTRAL_COLOR },
    audio: { ...NEUTRAL_AUDIO },
    mask: { ...NEUTRAL_MASK },
    chroma: { ...NEUTRAL_CHROMA },
  };
}

function makeTextClip(trackId: string, start: number): Clip {
  return {
    id: uid(),
    trackId,
    assetId: null,
    kind: 'text',
    name: 'Metin',
    start,
    duration: 4,
    srcIn: 0,
    speed: 1,
    reverse: false,
    transform: structuredClone(NEUTRAL_TRANSFORM),
    color: { ...NEUTRAL_COLOR },
    audio: { ...NEUTRAL_AUDIO },
    mask: { ...NEUTRAL_MASK },
    chroma: { ...NEUTRAL_CHROMA },
    text: { ...DEFAULT_TEXT },
  };
}

let lastSoftHistory = 0;
const HISTORY_LIMIT = 60;

export const useProjectStore = create<ProjectState>((set, get) => {
  const pushHistory = () => {
    const s = get();
    set({ past: [...s.past, docSnapshot(s)].slice(-HISTORY_LIMIT), future: [] });
  };
  const before = () => pushHistory();
  const beforeSoft = () => {
    const now = Date.now();
    if (now - lastSoftHistory > 800) {
      pushHistory();
      lastSoftHistory = now;
    }
  };

  return {
    settings: DEFAULT_SETTINGS,
    tracks: [],
    clips: [],
    markers: [],
    currentTime: 0,
    isPlaying: false,
    restored: false,
    past: [],
    future: [],

    setSettings: (patch) => {
      set((s) => ({ settings: { ...s.settings, ...patch } }));
      persistDebounced();
    },

    setCurrentTime: (t) => {
      set({ currentTime: Math.max(0, t) });
      persistDebounced();
    },

    setPlaying: (p) => set({ isPlaying: p }),

    addClipFromAsset: (assetId, trackId, start) => {
      const asset = useMediaStore.getState().assets.find((a) => a.id === assetId);
      if (!asset) return null;
      before();
      const s = get();
      const wantKind = trackKindForAsset(asset);
      let target = trackId ? s.tracks.find((t) => t.id === trackId && t.kind === wantKind) : undefined;
      if (!target) target = s.tracks.find((t) => t.kind === wantKind);
      if (!target) return null;
      const desired = Math.max(
        0,
        start ?? timelineDuration(s.clips.filter((c) => c.trackId === target!.id)),
      );
      const placed = clampIntoFreeGap(s.clips, '', target.id, desired, assetDuration(asset));
      const clip = makeMediaClip(asset, target.id, placed);
      set({ clips: [...s.clips, clip] });
      persistDebounced();
      return clip.id;
    },

    addTextClip: (start, _focusText) => {
      before();
      const s = get();
      // İmlecin içinde olduğu boş video track'i; yoksa V2 (en üst)
      const videoTracks = s.tracks.filter((t) => t.kind === 'video');
      const t0 = Math.max(0, start ?? s.currentTime);
      let target = videoTracks.find(
        (tr) => !s.clips.some((c) => c.trackId === tr.id && t0 >= c.start - 0.001 && t0 < c.start + c.duration + 0.001),
      );
      if (!target) target = videoTracks[videoTracks.length - 1] ?? s.tracks.find((t) => t.kind === 'video');
      if (!target) return null;
      const placed = clampIntoFreeGap(s.clips, '', target.id, t0, 4);
      const clip = makeTextClip(target.id, placed);
      set({ clips: [...s.clips, clip] });
      persistDebounced();
      return clip.id;
    },

    moveClip: (id, to) => {
      beforeSoft();
      const s = get();
      const clip = s.clips.find((c) => c.id === id);
      if (!clip) return;
      const target = s.tracks.find((t) => t.id === to.trackId);
      const sourceAsset = clip.assetId
        ? useMediaStore.getState().assets.find((a) => a.id === clip.assetId)
        : undefined;
      let finalTrackId = clip.trackId;
      if (target && !target.locked) {
        if (clip.kind === 'text') {
          if (target.kind === 'video') finalTrackId = target.id;
        } else if (sourceAsset) {
          if (trackKindForAsset(sourceAsset) === target.kind) finalTrackId = target.id;
        }
      }
      const placed = clampIntoFreeGap(s.clips, id, finalTrackId, Math.max(0, to.start), clip.duration);
      set({
        clips: s.clips.map((c) => (c.id === id ? { ...c, trackId: finalTrackId, start: placed } : c)),
      });
      persistDebounced();
    },

    trimClip: (id, edge, edgeTime) => {
      beforeSoft();
      const s = get();
      const clip = s.clips.find((c) => c.id === id);
      if (!clip) return;
      const track = s.tracks.find((t) => t.id === clip.trackId);
      if (track?.locked) return;
      const asset = clip.assetId
        ? useMediaStore.getState().assets.find((a) => a.id === clip.assetId)
        : undefined;
      const srcDur = asset && asset.kind !== 'image' ? asset.duration : Infinity;
      const others = s.clips.filter((c) => c.trackId === clip.trackId && c.id !== id);
      const prevEnd = others.length
        ? Math.max(0, ...others.filter((c) => c.start + c.duration <= clip.start + 0.001).map((c) => c.start + c.duration))
        : 0;
      const nextCandidates = others.filter((c) => c.start >= clip.start + clip.duration - 0.001).map((c) => c.start);
      const nextStart = nextCandidates.length ? Math.min(...nextCandidates) : Infinity;

      let start = clip.start;
      let duration = clip.duration;
      if (edge === 'start') {
        const minStart = Math.max(clip.start - clip.srcIn / clip.speed, prevEnd);
        const maxStart = clip.start + clip.duration - MIN_CLIP_DURATION;
        start = Math.max(minStart, Math.min(edgeTime, maxStart));
        duration = clip.start + clip.duration - start;
      } else {
        const maxDur = srcDur === Infinity ? Infinity : (srcDur - clip.srcIn) / clip.speed;
        const roomToNext = nextStart === Infinity ? Infinity : Math.max(MIN_CLIP_DURATION, nextStart - clip.start);
        const maxEnd = clip.start + Math.min(maxDur, roomToNext);
        // Sağ kenar asla başlangıcın + min sürenin soluna geçemez → "küçücük olma" yok
        duration = Math.max(MIN_CLIP_DURATION, Math.min(edgeTime, maxEnd) - clip.start);
      }
      if (!Number.isFinite(duration) || duration < MIN_CLIP_DURATION) duration = MIN_CLIP_DURATION;
      const deltaSrc = edge === 'start' ? (start - clip.start) * clip.speed : 0;
      set({
        clips: s.clips.map((c) =>
          c.id === id
            ? { ...c, start, duration, srcIn: Math.max(0, c.srcIn + deltaSrc) }
            : c,
        ),
      });
      persistDebounced();
    },

    /**
     * Kenar sürükleme = RETIME. Video/ses kliplerinde kaynak penceresi (duration × speed)
     * sabit kalır: kısaltınca hız artar, uzatınca yavaşlar (slow-mo).
     * Görsel/metin kliplerinde hız anlamsız → klasik süre kırpma.
     */
    retimeClip: (id, edge, edgeTime) => {
      beforeSoft();
      const s = get();
      const clip = s.clips.find((c) => c.id === id);
      if (!clip) return;
      const track = s.tracks.find((t) => t.id === clip.trackId);
      if (track?.locked) return;
      const asset = clip.assetId
        ? useMediaStore.getState().assets.find((a) => a.id === clip.assetId)
        : undefined;
      const hasSource = !!(asset && asset.kind !== 'image');
      if (!hasSource || clip.kind === 'text') {
        get().trimClip(id, edge, edgeTime);
        return;
      }
      const MIN_SPEED = 0.25;
      const MAX_SPEED = 8;
      const others = s.clips.filter((c) => c.trackId === clip.trackId && c.id !== id);
      const prevEnd = others.length
        ? Math.max(0, ...others.filter((c) => c.start + c.duration <= clip.start + 0.001).map((c) => c.start + c.duration))
        : 0;
      const nextCand = others.filter((c) => c.start >= clip.start + clip.duration - 0.001).map((c) => c.start);
      const nextStart = nextCand.length ? Math.min(...nextCand) : Infinity;
      const srcWindow = clip.duration * clip.speed; // sabit kaynak içeriği
      const minDur = Math.max(MIN_CLIP_DURATION, srcWindow / MAX_SPEED);

      if (edge === 'start') {
        const end = clip.start + clip.duration;
        const roomLeft = end - Math.max(prevEnd, 0);
        const maxDur = Math.min(srcWindow / MIN_SPEED, roomLeft);
        const minStart = end - Math.max(minDur, Math.min(maxDur, roomLeft));
        const maxStart = end - minDur;
        const start = Math.max(Math.min(minStart, maxStart), Math.min(edgeTime, maxStart));
        const duration = end - start;
        const speed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, srcWindow / duration));
        set({ clips: s.clips.map((c) => (c.id === id ? { ...c, start, duration, speed } : c)) });
      } else {
        const roomRight = nextStart === Infinity ? Infinity : Math.max(minDur, nextStart - clip.start);
        const maxDur = Math.min(srcWindow / MIN_SPEED, roomRight);
        const duration = Math.max(minDur, Math.min(edgeTime - clip.start, maxDur));
        const speed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, srcWindow / duration));
        set({ clips: s.clips.map((c) => (c.id === id ? { ...c, duration, speed } : c)) });
      }
      persistDebounced();
    },

    setClipSpeed: (id, newSpeed) => {
      const s = get();
      const clip = s.clips.find((c) => c.id === id);
      if (!clip) return;
      const asset = clip.assetId
        ? useMediaStore.getState().assets.find((a) => a.id === clip.assetId)
        : undefined;
      const hasSource = !!(asset && asset.kind !== 'image') && clip.kind !== 'text';
      if (!hasSource) {
        get().updateClip(id, { speed: 1 }, true);
        return;
      }
      beforeSoft();
      const MIN_SPEED = 0.25;
      const MAX_SPEED = 8;
      const target = Math.max(MIN_SPEED, Math.min(MAX_SPEED, newSpeed));
      const srcWindow = clip.duration * clip.speed;
      const others = s.clips.filter((c) => c.trackId === clip.trackId && c.id !== id);
      const nextCand = others.filter((c) => c.start >= clip.start + clip.duration - 0.001).map((c) => c.start);
      const nextStart = nextCand.length ? Math.min(...nextCand) : Infinity;
      const roomRight = nextStart === Infinity ? Infinity : Math.max(MIN_CLIP_DURATION, nextStart - clip.start);
      let duration = Math.min(srcWindow / target, roomRight);
      if (duration < MIN_CLIP_DURATION) duration = MIN_CLIP_DURATION;
      const speed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, srcWindow / duration));
      set({ clips: s.clips.map((c) => (c.id === id ? { ...c, duration, speed } : c)) });
      persistDebounced();
    },

    splitClip: (id, at) => {
      before();
      const s = get();
      const clip = s.clips.find((c) => c.id === id);
      if (!clip) return;
      // Bölme noktasını kare ızgarasına yuvarla — bölme anındaki kare iki
      // parçada da görünmesin (solun son karesi ≠ sağın ilk karesi)
      const qAt = Math.round(at * s.settings.fps) / s.settings.fps;
      const local = qAt - clip.start;
      if (local < MIN_CLIP_DURATION || clip.duration - local < MIN_CLIP_DURATION) return;
      const left: Clip = { ...structuredClone(clip), duration: local, audio: { ...clip.audio, fadeOut: 0 } };
      const right: Clip = {
        ...structuredClone(clip),
        id: uid(),
        start: qAt,
        duration: clip.duration - local,
        srcIn: clip.srcIn + local * clip.speed,
        transitionIn: undefined,
        audio: { ...clip.audio, fadeIn: 0 },
      };
      set({ clips: [...s.clips.filter((c) => c.id !== id), left, right] });
      persistDebounced();
    },

    /** Razor aracı: SEÇİLİ klip(ler)i İMLEÇ neresindeyse oradan keser. */
    splitSelectedAtPlayhead: () => {
      const s = get();
      const ids = s.clips.filter(
        (c) =>
          s.currentTime > c.start + MIN_CLIP_DURATION &&
          s.currentTime < c.start + c.duration - MIN_CLIP_DURATION &&
          useUiSelection().includes(c.id),
      );
      for (const c of ids) get().splitClip(c.id, s.currentTime);
    },

    removeClips: (ids) => {
      if (ids.length === 0) return;
      before();
      set((s) => ({
        clips: s.clips
          .filter((c) => !ids.includes(c.id))
          .map((c) => (c.maskClipId && ids.includes(c.maskClipId) ? { ...c, maskClipId: null } : c)),
      }));
      persistDebounced();
    },

    attachMaskClip: (maskId, targetId) => {
      const s = get();
      const mask = s.clips.find((c) => c.id === maskId);
      if (!mask || mask.kind !== 'media' || !mask.assetId) return;
      if (targetId === null) {
        // bu maskeyi kullanan tüm hedeflerden bağlantıyı kes
        before();
        set({ clips: s.clips.map((c) => (c.maskClipId === maskId ? { ...c, maskClipId: null } : c)) });
        persistDebounced();
        return;
      }
      if (targetId === maskId) return;
      const target = s.clips.find((c) => c.id === targetId);
      if (!target) return;
      // maske klibi kendisi maske kullanmasın (tek düzey)
      if (target.maskClipId) return;
      before();
      set({ clips: s.clips.map((c) => (c.id === targetId ? { ...c, maskClipId: maskId } : c)) });
      persistDebounced();
    },

    duplicateClip: (id) => {
      before();
      const s = get();
      const clip = s.clips.find((c) => c.id === id);
      if (!clip) return null;
      // Kopya aynı konumda başlar; Alt+sürükleme anında oluşur ve hemen
      // taşındığından çakışma kalıcı olmaz (moveClip boşluğa sıkıştırır)
      const copy: Clip = { ...structuredClone(clip), id: uid() };
      set({ clips: [...s.clips, copy] });
      persistDebounced();
      return copy.id;
    },

    updateClip: (id, patch, soft = false) => {
      if (soft) beforeSoft();
      else before();
      set((s) => ({
        clips: s.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      }));
      persistDebounced();
    },

    updateTrack: (id, patch) => {
      beforeSoft();
      set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
      persistDebounced();
    },

    addTrack: (kind) => {
      before();
      const s = get();
      const count = s.tracks.filter((t) => t.kind === kind).length + 1;
      const name = kind === 'video' ? `V${count}` : `A${count}`;
      const track: Track = { id: uid(), kind, name, muted: false, locked: false, hidden: false };
      // Track'ler türlerine göre gruplanır: video track'ler üstte (yenisi en
      // üste, numarası üsttekiyle büyür), ses track'leri en altta sonda
      const tracks = kind === 'video' ? [track, ...s.tracks] : [...s.tracks, track];
      set({ tracks });
      persistDebounced();
    },

    removeTrack: (id) => {
      before();
      const s = get();
      const track = s.tracks.find((t) => t.id === id);
      if (!track) return;
      const sameKind = s.tracks.filter((t) => t.kind === track.kind);
      if (sameKind.length <= 1) return;
      set({
        tracks: s.tracks.filter((t) => t.id !== id),
        clips: s.clips.filter((c) => c.trackId !== id),
      });
      persistDebounced();
    },

    moveTrackToSlot: (id, slot) => {
      const s = get();
      const moved = s.tracks.find((t) => t.id === id);
      if (!moved) return;
      const without = s.tracks.filter((t) => t.id !== id);
      const sameKind = without.filter((t) => t.kind === moved.kind);
      const clamped = Math.max(0, Math.min(sameKind.length, slot));
      const withInserted = [...without.filter((t) => t.kind === moved.kind)];
      withInserted.splice(clamped, 0, moved);
      const others = without.filter((t) => t.kind !== moved.kind);
      const next = moved.kind === 'video' ? [...withInserted, ...others] : [...others, ...withInserted];
      // konum değişmediyse geçmiş kirletme
      if (next.every((t, i) => s.tracks[i]?.id === t.id)) return;
      before();
      set({ tracks: next });
      persistDebounced();
    },

    addMarker: (t) => {
      before();
      const colors = ['#f5a524', '#4c7ff0', '#46a758', '#e5484d', '#b18cfa'];
      const s = get();
      const marker: Marker = {
        id: uid(),
        t: Math.max(0, t),
        color: colors[s.markers.length % colors.length],
        label: `M${s.markers.length + 1}`,
      };
      set({ markers: [...s.markers, marker] });
      persistDebounced();
    },

    removeMarker: (id) => {
      before();
      set((s) => ({ markers: s.markers.filter((m) => m.id !== id) }));
      persistDebounced();
    },

    detachAudio: (clipId) => {
      const s = get();
      const clip = s.clips.find((c) => c.id === clipId);
      if (!clip || clip.kind !== 'media' || !clip.assetId) return null;
      const asset = useMediaStore.getState().assets.find((a) => a.id === clip.assetId);
      if (!asset || !asset.hasAudio || asset.kind !== 'video') return null;
      before();
      const audioTrack = s.tracks.find((t) => t.kind === 'audio');
      if (!audioTrack) return null;
      const placed = clampIntoFreeGap(s.clips, '', audioTrack.id, clip.start, clip.duration);
      const audioClip: Clip = {
        ...structuredClone(clip),
        id: uid(),
        trackId: audioTrack.id,
        start: placed,
        name: `${clip.name} (ses)`,
        transitionIn: undefined,
        audio: { ...NEUTRAL_AUDIO, volume: clip.audio.volume },
      };
      set({
        clips: [
          ...s.clips.map((c) => (c.id === clipId ? { ...c, audio: { ...c.audio, muted: true } } : c)),
          audioClip,
        ],
      });
      persistDebounced();
      return audioClip.id;
    },

    /** Açılan .evproj belgesini uygular; eksik medyanın klip id'lerini döner. */
    loadDocument: (doc) => {
      before();
      const assets = useMediaStore.getState().assets;
      const missing: string[] = [];
      const clips = (doc.clips ?? []).map((c) => {
        if (c.assetId && !assets.some((a) => a.id === c.assetId)) missing.push(c.id);
        return {
          ...c,
          color: { ...NEUTRAL_COLOR, ...c.color },
          mask: c.mask ?? { ...NEUTRAL_MASK },
          chroma: c.chroma ?? { ...NEUTRAL_CHROMA },
          reverse: c.reverse ?? false,
          speed: c.speed ?? 1,
        };
      });
      set({
        settings: { ...DEFAULT_SETTINGS, ...doc.settings },
        tracks: doc.tracks,
        clips,
        markers: doc.markers ?? [],
        currentTime: 0,
      });
      persistNow();
      return missing;
    },

    newDocument: () => {
      before();
      set({
        settings: { ...DEFAULT_SETTINGS },
        tracks: defaultTracks(),
        clips: [],
        markers: [],
        currentTime: 0,
      });
      persistNow();
    },

    undo: () => {
      const s = get();
      if (s.past.length === 0) return;
      const prev = s.past[s.past.length - 1];
      set({
        past: s.past.slice(0, -1),
        future: [docSnapshot(s), ...s.future].slice(0, HISTORY_LIMIT),
        settings: prev.settings,
        tracks: prev.tracks,
        clips: prev.clips,
        markers: prev.markers,
      });
      persistDebounced();
    },

    redo: () => {
      const s = get();
      if (s.future.length === 0) return;
      const next = s.future[0];
      set({
        past: [...s.past, docSnapshot(s)].slice(-HISTORY_LIMIT),
        future: s.future.slice(1),
        settings: next.settings,
        tracks: next.tracks,
        clips: next.clips,
        markers: next.markers,
      });
      persistDebounced();
    },

    restore: async () => {
      if (get().restored) return;
      const doc = await loadProjectDoc();
      if (doc && doc.tracks.length > 0) {
        set({
          settings: { ...DEFAULT_SETTINGS, ...doc.settings },
          tracks: doc.tracks,
          clips: (doc.clips ?? []).map((c) => ({
            ...c,
            color: { ...NEUTRAL_COLOR, ...c.color },
            mask: c.mask ?? { ...NEUTRAL_MASK },
            chroma: c.chroma ?? { ...NEUTRAL_CHROMA },
            reverse: c.reverse ?? false,
            speed: c.speed ?? 1,
          })),
          markers: doc.markers ?? [],
          currentTime: doc.currentTime ?? 0,
          restored: true,
        });
      } else {
        set({ tracks: defaultTracks(), restored: true });
        persistNow();
      }
    },
  };
});

/** Seçim store'una döngüsel bağımlılık olmadan erişim (razor için). */
import { useUiStore } from './uiStore';
function useUiSelection(): string[] {
  return useUiStore.getState().selectedClipIds;
}
