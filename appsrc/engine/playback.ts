import { renderer, type RenderData } from './renderer';
import { useProjectStore, timelineDuration } from '../state/projectStore';
import { useMediaStore } from '../state/mediaStore';
import { useUiStore } from '../state/uiStore';
import { effectiveValues } from '../utils';
import type { Clip, MediaAsset } from '../types';

/**
 * Oynatma motoru: her klip için gizli medya elementi havuzu tutar,
 * performance.now tabanlı ana saatle timeline zamanını ilerletir
 * (rAF arka plan sekmelerinde durabildiğinden interval tabanlıdır).
 * Ters oynatma klibi her tik'te seek edilerek ilerletilir.
 */
class PlaybackEngine {
  private elements = new Map<string, HTMLMediaElement>();
  private clockStart = 0;
  private timeStart = 0;
  private _time = 0;
  private _playing = false;
  private rate = 1;
  private dirty = true;
  private lastStoreSync = 0;
  private inited = false;
  /** Oynatma üst sınırı: seçim varsa seçili kliplerin sonu, yoksa timeline sonu. */
  private playLimit = Infinity;

  get time(): number {
    return this._time;
  }

  get playing(): boolean {
    return this._playing;
  }

  init(): void {
    if (this.inited) return;
    this.inited = true;
    renderer.onNeedRedraw = () => this.markDirty();
    useProjectStore.subscribe(() => this.markDirty());
    useMediaStore.subscribe(() => this.markDirty());
    window.setInterval(this.loop, 30);
  }

  markDirty(): void {
    this.dirty = true;
  }

  // --- Kullanıcı komutları ---

  play(): void {
    if (this._playing) return;
    const p = useProjectStore.getState();
    const dur = timelineDuration(p.clips);
    // Seçim varsa yalnız seçili kliplerin sonuna kadar oynat
    const sel = useUiStore.getState().selectedClipIds;
    const selClips = sel.length > 0 ? p.clips.filter((c) => sel.includes(c.id)) : [];
    if (selClips.length > 0) {
      const selEnd = Math.max(...selClips.map((c) => c.start + c.duration));
      const selStart = Math.min(...selClips.map((c) => c.start));
      this.playLimit = Math.min(dur, Math.max(selEnd, 0));
      if (this._time >= this.playLimit - 0.001) this._time = selStart;
    } else {
      this.playLimit = dur;
      if (this._time >= dur - 0.001) this._time = 0;
    }
    this._playing = true;
    this.rate = 1;
    this.timeStart = this._time;
    this.clockStart = performance.now();
    useProjectStore.getState().setPlaying(true);
    this.markDirty();
  }

  pause(): void {
    if (!this._playing) return;
    this._playing = false;
    this.rate = 1;
    for (const el of this.elements.values()) {
      if (!el.paused) el.pause();
    }
    const store = useProjectStore.getState();
    store.setPlaying(false);
    store.setCurrentTime(this._time);
    this.markDirty();
  }

  toggle(): void {
    if (this._playing) this.pause();
    else this.play();
  }

  seek(t: number): void {
    const dur = timelineDuration(useProjectStore.getState().clips);
    this._time = Math.min(Math.max(0, t), Math.max(0, dur));
    if (this._playing) {
      this.timeStart = this._time;
      this.clockStart = performance.now();
    }
    useProjectStore.getState().setCurrentTime(this._time);
    this.markDirty();
  }

  stepFrames(n: number): void {
    const fps = useProjectStore.getState().settings.fps;
    this.pause();
    this.seek(this._time + n / fps);
  }

  /** J-K-L: L çal (tekrar basılışta hızlan), K dur, J geri atlar. */
  jkl(key: 'j' | 'k' | 'l'): void {
    if (key === 'k') {
      this.pause();
      return;
    }
    if (key === 'j') {
      this.pause();
      this.seek(this._time - 1);
      return;
    }
    if (!this._playing) {
      this.play();
    } else {
      this.rate = Math.min(4, this.rate * 2);
      this.timeStart = this._time;
      this.clockStart = performance.now();
    }
  }

  // --- Dahili ---

  private loop = (): void => {
    const now = performance.now();
    if (this._playing) {
      this._time = this.timeStart + ((now - this.clockStart) / 1000) * this.rate;
      const dur = timelineDuration(useProjectStore.getState().clips);
      const limit = Math.min(dur, this.playLimit);
      if (this._time >= limit) {
        this._time = Math.max(0, limit);
        this.pause();
      }
      this.dirty = true;
    }
    this.syncElements();
    if (this.dirty) {
      const rd = this.renderData();
      renderer.syncMaskVideos(this._time, this._playing, rd.clips, rd.assets);
      renderer.renderFrame(this._time, rd);
      this.dirty = this._playing;
    }
    if (now - this.lastStoreSync > 40) {
      const storeTime = useProjectStore.getState().currentTime;
      if (Math.abs(storeTime - this._time) > 0.008) {
        useProjectStore.getState().setCurrentTime(this._time);
      }
      this.lastStoreSync = now;
    }
  };

  private renderData(): RenderData {
    const p = useProjectStore.getState();
    const m = useMediaStore.getState();
    return {
      settings: p.settings,
      tracks: p.tracks,
      clips: p.clips,
      assets: m.assets,
      getElement: (clipId) => this.elements.get(clipId) ?? null,
    };
  }

  private fadeGain(clip: Clip, t: number, effVolume: number): number {
    const local = t - clip.start;
    let g = 1;
    if (clip.audio.fadeIn > 0.001 && local < clip.audio.fadeIn) {
      g *= Math.max(0, local / clip.audio.fadeIn);
    }
    const tail = clip.start + clip.duration - t;
    if (clip.audio.fadeOut > 0.001 && tail < clip.audio.fadeOut) {
      g *= Math.max(0, tail / clip.audio.fadeOut);
    }
    return g * effVolume;
  }

  /** Klip t anındaki kaynak zamanı (hız + ters oynatma). */
  static sourceTime(clip: Clip, t: number): number {
    const local = t - clip.start;
    const eff = clip.reverse
      ? Math.max(0, clip.duration - local) * clip.speed
      : local * clip.speed;
    return Math.max(0, clip.srcIn + eff);
  }

  /** t anında element gerektiren klipler: aktifler + geçiş penceresindeki öncekiler
   *  + aktiflerin bağlı maske klipleri (onlar da kaynak olarak oynatılır). */
  private clipsNeedingElements(t: number): Clip[] {
    const clips = useProjectStore.getState().clips;
    const result: Clip[] = [];
    for (const clip of clips) {
      if (clip.kind !== 'media') continue;
      const active = t >= clip.start - 1e-6 && t < clip.start + clip.duration + 1e-6;
      if (active) {
        result.push(clip);
        continue;
      }
      const tr = clip.transitionIn;
      if (tr && t >= clip.start && t < clip.start + tr.duration) {
        const prev = clips
          .filter(
            (c) =>
              c.kind === 'media' &&
              c.trackId === clip.trackId &&
              c.start + c.duration <= clip.start + 0.001,
          )
          .sort((a, b) => b.start + b.duration - (a.start + a.duration))[0];
        if (prev && !result.includes(prev)) result.push(prev);
      }
    }
    // bağlı maske klipleri (kendi zaman aralığındaysa)
    for (const c of clips) {
      if (!c.maskClipId) continue;
      const mc = clips.find((x) => x.id === c.maskClipId);
      if (
        mc &&
        mc.kind === 'media' &&
        t >= mc.start - 1e-6 &&
        t < mc.start + mc.duration + 1e-6 &&
        !result.includes(mc)
      ) {
        result.push(mc);
      }
    }
    return result;
  }

  private ensureElement(clip: Clip, asset: MediaAsset): HTMLMediaElement {
    const existing = this.elements.get(clip.id);
    if (existing) return existing;
    const el: HTMLMediaElement =
      asset.kind === 'audio' ? document.createElement('audio') : document.createElement('video');
    if (asset.kind !== 'audio') {
      const v = el as HTMLVideoElement;
      v.playsInline = true;
      v.preload = 'auto';
    }
    el.src = asset.url ?? '';
    el.addEventListener('seeked', () => this.markDirty());
    el.addEventListener('loadeddata', () => this.markDirty());
    this.elements.set(clip.id, el);
    return el;
  }

  private syncElements(): void {
    const p = useProjectStore.getState();
    const m = useMediaStore.getState();
    const master = useUiStore.getState().masterVolume;
    const active = this.clipsNeedingElements(this._time);
    const activeIds = new Set(active.map((c) => c.id));
    // maske klibi olarak kullanılan klipler sessiz çalınır
    const maskIds = new Set<string>();
    for (const c of p.clips) if (c.maskClipId) maskIds.add(c.maskClipId);

    for (const [clipId, el] of Array.from(this.elements.entries())) {
      if (!p.clips.some((c) => c.id === clipId)) {
        el.pause();
        el.removeAttribute('src');
        el.load();
        this.elements.delete(clipId);
      }
    }

    for (const clip of active) {
      const asset = clip.assetId ? m.assets.find((a) => a.id === clip.assetId) : undefined;
      if (!asset || !asset.url) continue;
      const track = p.tracks.find((tr) => tr.id === clip.trackId);
      if (!track) continue;
      const el = this.ensureElement(clip, asset) as HTMLVideoElement;
      const srcT = PlaybackEngine.sourceTime(clip, this._time);
      const eff = effectiveValues(clip, this._time);
      const audible = !clip.audio.muted && !track.muted && asset.hasAudio && !maskIds.has(clip.id);
      const vol =
        Math.min(1, Math.max(0, eff.volume)) *
        this.fadeGain(clip, this._time, audible ? 1 : 0) *
        master;
      el.volume = vol;
      el.muted = vol <= 0.001;

      if (this._playing && !clip.reverse) {
        el.playbackRate = Math.min(4, Math.max(0.25, clip.speed * this.rate));
        if (el.paused) {
          el.play().catch(() => {
            el.muted = true;
            el.play().catch(() => undefined);
          });
        }
        const drift = el.currentTime - srcT;
        if (Math.abs(drift) > 0.35) {
          el.currentTime = Math.max(0, srcT);
        } else if (Math.abs(drift) > 0.045) {
          el.playbackRate = Math.min(4, Math.max(0.25, el.playbackRate * (drift > 0 ? 0.92 : 1.08)));
        }
      } else {
        // Duraklatılmış ya da ters oynatma: her tik kesin kareye seek
        if (!el.paused) el.pause();
        if (el.readyState >= 1 && Math.abs(el.currentTime - srcT) > 0.02) {
          el.currentTime = Math.max(0, srcT);
        }
      }
    }

    for (const [clipId, el] of this.elements) {
      if (!activeIds.has(clipId) && !el.paused) el.pause();
    }
  }
}

export const playback = new PlaybackEngine();
export { PlaybackEngine };
