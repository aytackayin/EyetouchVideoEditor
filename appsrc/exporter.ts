import {
  Output,
  BufferTarget,
  Mp4OutputFormat,
  MovOutputFormat,
  WebMOutputFormat,
  MkvOutputFormat,
  CanvasSource,
  AudioBufferSource,
  canEncodeVideo,
  canEncodeAudio,
  QUALITY_LOW,
  QUALITY_MEDIUM,
  QUALITY_HIGH,
  QUALITY_VERY_HIGH,
} from 'mediabunny';
import type { Quality } from 'mediabunny';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import lamejs from 'lamejs';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import type { Clip, MediaAsset, Track } from '../types';
import { useProjectStore, timelineDuration } from '../state/projectStore';
import { useMediaStore } from '../state/mediaStore';
import { getAudioBuffer } from '../media/audioCache';
import { Renderer } from '../engine/renderer';
import { playback } from '../engine/playback';
import { effectiveValues } from '../utils';

export type ExportContainer =
  | 'mp4' | 'mov' | 'webm' | 'mkv' | 'gif'
  | 'avi' | 'flv' | 'wmv' | 'mpegts'
  | 'mp3' | 'wav' | 'ogg' | 'flac' | 'm4a';

export type ExportVideoCodec = 'avc' | 'hevc' | 'vp9' | 'av1';

export interface ExportOptions {
  container: ExportContainer;
  videoCodec: ExportVideoCodec;
  quality: 'low' | 'medium' | 'high' | 'veryhigh';
  scale: number;
  fps: number;
  includeAudio: boolean;
  fileName: string;
  onProgress: (progress: number, stage: string) => void;
  cancelRef: { cancelled: boolean };
}

export class ExportCancelledError extends Error {
  constructor() {
    super('cancelled');
  }
}

const QUALITY_MAP: Record<ExportOptions['quality'], Quality> = {
  low: QUALITY_LOW,
  medium: QUALITY_MEDIUM,
  high: QUALITY_HIGH,
  veryhigh: QUALITY_VERY_HIGH,
};

const NATIVE_VIDEO: ExportContainer[] = ['mp4', 'mov', 'webm', 'mkv'];
const FFMPEG_VIDEO: ExportContainer[] = ['avi', 'flv', 'wmv', 'mpegts'];
const AUDIO_ONLY: ExportContainer[] = ['mp3', 'wav', 'ogg', 'flac', 'm4a'];

export const CONTAINER_EXT: Record<ExportContainer, string> = {
  mp4: 'mp4', mov: 'mov', webm: 'webm', mkv: 'mkv', gif: 'gif',
  avi: 'avi', flv: 'flv', wmv: 'wmv', mpegts: 'ts',
  mp3: 'mp3', wav: 'wav', ogg: 'ogg', flac: 'flac', m4a: 'm4a',
};

const NATIVE_MIME: Partial<Record<ExportContainer, string>> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  gif: 'image/gif',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
};

export const EXPORT_SCALE_OPTIONS = [1, 0.75, 0.5] as const;
export const EXPORT_FPS_OPTIONS = [24, 25, 30, 50, 60] as const;

export async function probeCodecSupport(width: number, height: number): Promise<{
  video: Record<ExportVideoCodec, boolean>;
  aac: boolean;
  opus: boolean;
}> {
  const results = await Promise.all([
    canEncodeVideo('avc', { width, height }).catch(() => false),
    canEncodeVideo('hevc', { width, height }).catch(() => false),
    canEncodeVideo('vp9', { width, height }).catch(() => false),
    canEncodeVideo('av1', { width, height }).catch(() => false),
    canEncodeAudio('aac').catch(() => false),
    canEncodeAudio('opus').catch(() => false),
  ]);
  return {
    video: { avc: results[0], hevc: results[1], vp9: results[2], av1: results[3] },
    aac: results[4],
    opus: results[5],
  };
}

let ffmpegPromise: Promise<FFmpeg> | null = null;

function getFFmpeg(onStatus?: (msg: string) => void): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ff = new FFmpeg();
      if (onStatus) onStatus('ffmpeg yükleniyor…');
      const [coreURL, wasmURL, workerURL] = await Promise.all([
        toBlobURL('/ffmpeg/ffmpeg-core.js', 'text/javascript'),
        toBlobURL('/ffmpeg/ffmpeg-core.wasm', 'application/wasm'),
        toBlobURL('/ffmpeg/ffmpeg-core.worker.js', 'text/javascript'),
      ]);
      await ff.load({ coreURL, wasmURL, workerURL });
      return ff;
    })();
    ffmpegPromise.catch(() => {
      ffmpegPromise = null;
    });
  }
  return ffmpegPromise;
}

async function ffmpegConvertVideo(ff: FFmpeg, container: ExportContainer): Promise<string> {
  switch (container) {
    case 'avi':
      await ff.exec(['-i', 'in.mp4', '-c:v', 'mpeg4', '-vtag', 'xvid', '-qscale:v', '5', '-c:a', 'libmp3lame', '-q:a', '4', '-y', 'out.avi']);
      return 'out.avi';
    case 'flv':
      await ff.exec(['-i', 'in.mp4', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-y', 'out.flv']);
      return 'out.flv';
    case 'wmv':
      await ff.exec(['-i', 'in.mp4', '-c:v', 'wmv2', '-qscale:v', '5', '-c:a', 'wmav2', '-b:a', '128k', '-y', 'out.wmv']);
      return 'out.wmv';
    case 'mpegts':
      await ff.exec(['-i', 'in.mp4', '-c', 'copy', '-f', 'mpegts', '-y', 'out.ts']);
      return 'out.ts';
    default:
      throw new Error('Bilinmeyen dönüştürme formatı');
  }
}

async function ffmpegConvertAudio(ff: FFmpeg, container: ExportContainer): Promise<string> {
  switch (container) {
    case 'mp3':
      await ff.exec(['-i', 'in.wav', '-c:a', 'libmp3lame', '-q:a', '2', '-y', 'out.mp3']);
      return 'out.mp3';
    case 'ogg':
      await ff.exec(['-i', 'in.wav', '-c:a', 'libvorbis', '-q:a', '5', '-y', 'out.ogg']);
      return 'out.ogg';
    case 'flac':
      await ff.exec(['-i', 'in.wav', '-c:a', 'flac', '-y', 'out.flac']);
      return 'out.flac';
    case 'm4a':
      await ff.exec(['-i', 'in.wav', '-c:a', 'aac', '-b:a', '192k', '-y', 'out.m4a']);
      return 'out.m4a';
    default:
      throw new Error('Bilinmeyen ses formatı');
  }
}

function reverseBuffer(ctx: BaseAudioContext, buffer: AudioBuffer): AudioBuffer {
  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0, n = buffer.length; i < n; i++) dst[i] = src[n - 1 - i];
  }
  return out;
}

async function mixAudio(duration: number, tracks: Track[], clips: Clip[], assets: MediaAsset[]): Promise<AudioBuffer | null> {
  const sr = 48000;
  const audibleClips = clips.filter((c) => {
    const asset = c.assetId ? assets.find((a) => a.id === c.assetId) : undefined;
    if (!asset || !asset.hasAudio) return false;
    const track = tracks.find((tr) => tr.id === c.trackId);
    return !!(track && !track.muted && !c.audio.muted);
  });
  if (audibleClips.length === 0 || duration <= 0) return null;
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sr), sr);
  let any = false;
  for (const clip of audibleClips) {
    const asset = assets.find((a) => a.id === clip.assetId)!;
    let buffer = await getAudioBuffer(asset);
    if (!buffer) continue;
    if (clip.reverse) buffer = reverseBuffer(ctx, buffer);
    const speed = Math.max(0.0625, clip.speed);
    const takeDur = Math.min(clip.duration * speed, buffer.duration - clip.srcIn);
    if (takeDur <= 0.001) continue;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = speed;
    const gain = ctx.createGain();
    const startAt = clip.start;
    const hasVolKfs = clip.keyframes?.volume?.length;
    if (hasVolKfs) {
      const steps = Math.max(2, Math.ceil(clip.duration * 20));
      const curve = new Float32Array(steps);
      for (let i = 0; i < steps; i++) {
        curve[i] = effectiveValues(clip, clip.start + (clip.duration * i) / (steps - 1)).volume;
      }
      gain.gain.setValueCurveAtTime(curve, startAt, clip.duration);
    } else {
      gain.gain.setValueAtTime(clip.audio.volume, Math.max(0, startAt));
      if (clip.audio.fadeIn > 0.001) {
        gain.gain.setValueAtTime(0, Math.max(0, startAt));
        gain.gain.linearRampToValueAtTime(clip.audio.volume, startAt + Math.min(clip.audio.fadeIn, clip.duration));
      }
      if (clip.audio.fadeOut > 0.001) {
        gain.gain.setValueAtTime(clip.audio.volume, startAt + clip.duration - Math.min(clip.audio.fadeOut, clip.duration));
        gain.gain.linearRampToValueAtTime(0, startAt + clip.duration);
      }
    }
    let node: AudioNode = src;
    if (clip.audio.noiseReduce) {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 85;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -45;
      comp.ratio.value = 10;
      comp.attack.value = 0.01;
      comp.release.value = 0.2;
      node.connect(hp);
      hp.connect(comp);
      node = comp;
    }
    node.connect(gain);
    gain.connect(ctx.destination);
    src.start(startAt, clip.srcIn, takeDur);
    any = true;
  }
  if (!any) return null;
  return await ctx.startRendering();
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numCh = Math.min(2, buffer.numberOfChannels);
  const len = buffer.length;
  const bytesPerSample = 2;
  const dataSize = len * numCh * bytesPerSample;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * numCh * bytesPerSample, true);
  view.setUint16(32, numCh * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      let v = channels[c][i];
      v = Math.max(-1, Math.min(1, v));
      view.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}

function audioBufferToMp3(buffer: AudioBuffer, kbps = 192): Blob {
  const numCh = Math.min(2, buffer.numberOfChannels);
  const enc = new lamejs.Mp3Encoder(numCh, buffer.sampleRate, kbps);
  const toInt16 = (f: Float32Array): Int16Array => {
    const out = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) {
      const v = Math.max(-1, Math.min(1, f[i]));
      out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    return out;
  };
  const left = toInt16(buffer.getChannelData(0));
  const right = numCh > 1 ? toInt16(buffer.getChannelData(1)) : undefined;
  const blockSize = 1152;
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < left.length; i += blockSize) {
    const l = left.subarray(i, i + blockSize);
    const r = right ? right.subarray(i, i + blockSize) : undefined;
    const data = r ? enc.encodeBuffer(l, r) : enc.encodeBuffer(l);
    if (data.length > 0) chunks.push(new Uint8Array(data));
  }
  const end = enc.flush();
  if (end.length > 0) chunks.push(new Uint8Array(end));
  return new Blob(chunks as BlobPart[], { type: 'audio/mpeg' });
}

class ExportPool {
  private els = new Map<string, HTMLVideoElement | HTMLAudioElement>();

  get(clipId: string, asset: MediaAsset): HTMLVideoElement | HTMLAudioElement {
    let el = this.els.get(clipId);
    if (!el) {
      el = asset.kind === 'audio' ? document.createElement('audio') : document.createElement('video');
      if (el instanceof HTMLVideoElement) {
        el.muted = true;
        el.playsInline = true;
      }
      el.preload = 'auto';
      el.src = asset.url ?? '';
      this.els.set(clipId, el);
    }
    return el;
  }

  static async waitReady(el: HTMLMediaElement): Promise<void> {
    if (el.readyState >= 2) return;
    await new Promise<void>((resolve) => {
      const done = () => { el.removeEventListener('loadeddata', done); clearTimeout(timer); resolve(); };
      const timer = setTimeout(done, 5000);
      el.addEventListener('loadeddata', done, { once: true });
    });
  }

  static async seekTo(el: HTMLMediaElement, t: number): Promise<void> {
    if (Math.abs(el.currentTime - t) < 0.001) return;
    await new Promise<void>((resolve) => {
      const done = () => { el.removeEventListener('seeked', done); clearTimeout(timer); resolve(); };
      const timer = setTimeout(done, 3000);
      el.addEventListener('seeked', done, { once: true });
      try {
        el.currentTime = Math.max(0, t);
      } catch {
        done();
      }
    });
  }

  destroy(): void {
    for (const el of this.els.values()) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    this.els.clear();
  }
}

function sourceTime(clip: Clip, t: number): number {
  const local = t - clip.start;
  const eff = clip.reverse ? Math.max(0, clip.duration - local) * clip.speed : local * clip.speed;
  return Math.max(0, clip.srcIn + eff);
}

export async function runExport(opts: ExportOptions): Promise<{ blob: Blob; fileName: string }> {
  playback.pause();
  const p = useProjectStore.getState();
  const m = useMediaStore.getState();
  const { settings, tracks, clips } = p;
  const assets = m.assets;
  const duration = timelineDuration(clips);
  if (duration <= 0.01) throw new Error('Zaman çizgisi boş — önce klip ekleyin');

  const W = Math.round(Math.min(7680, Math.max(16, settings.width * opts.scale)) / 2) * 2;
  const H = Math.round(Math.min(7680, Math.max(16, settings.height * opts.scale)) / 2) * 2;
  const isGif = opts.container === 'gif';
  const fps = isGif ? Math.min(opts.fps, 15) : opts.fps;
  const ext = CONTAINER_EXT[opts.container];
  const baseName = (opts.fileName.replace(/\.[a-z0-9]+$/i, '') || 'export').replace(/[^\w\-. ]+/g, '_');
  const outName = baseName + '.' + ext;

  let mix: AudioBuffer | null = null;
  if (opts.includeAudio && opts.container !== 'gif') {
    opts.onProgress(0.01, 'Ses karıştırılıyor');
    mix = await mixAudio(duration, tracks, clips, assets);
  }

  if (AUDIO_ONLY.includes(opts.container)) {
    if (!mix) throw new Error('Dışa aktarılacak ses yok');
    if (opts.container === 'wav' || opts.container === 'mp3') {
      opts.onProgress(0.6, 'Ses kodlanıyor');
      const blob = opts.container === 'wav' ? audioBufferToWav(mix) : audioBufferToMp3(mix);
      opts.onProgress(1, 'Tamamlandı');
      return { blob, fileName: outName };
    }
    const ff = await getFFmpeg((s) => opts.onProgress(0.3, s));
    await ff.writeFile('in.wav', new Uint8Array(await audioBufferToWav(mix).arrayBuffer()));
    opts.onProgress(0.4, 'Ses kodlanıyor');
    const outFile = await ffmpegConvertAudio(ff, opts.container);
    if (opts.cancelRef.cancelled) throw new ExportCancelledError();
    const data = await ff.readFile(outFile);
    opts.onProgress(1, 'Tamamlandı');
    return { blob: new Blob([data], { type: 'application/octet-stream' }), fileName: outName };
  }

  const renderCanvas = document.createElement('canvas');
  renderCanvas.width = settings.width;
  renderCanvas.height = settings.height;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = W;
  outCanvas.height = H;
  const outCtx = outCanvas.getContext('2d', { willReadFrequently: isGif })!;
  const renderer = new Renderer();
  renderer.attach(renderCanvas);
  renderer.setSize(settings.width, settings.height);

  const pool = new ExportPool();
  renderer.preloadMaskImages(clips, assets);
  opts.onProgress(0.02, 'Medya hazırlanıyor');
  for (const clip of clips) {
    if (clip.kind !== 'media') continue;
    const asset = clip.assetId ? assets.find((a) => a.id === clip.assetId) : undefined;
    if (!asset || !asset.url || asset.kind === 'image') continue;
    const el = pool.get(clip.id, asset);
    await ExportPool.waitReady(el);
    if (opts.cancelRef.cancelled) {
      pool.destroy();
      throw new ExportCancelledError();
    }
  }
  // maske videoları da hazır olsun
  for (const clip of clips) {
    if (clip.mask.enabled && clip.mask.shape === 'video') {
      const mel = renderer.getMaskVideo(clip, assets);
      if (mel) await ExportPool.waitReady(mel);
    }
  }

  const elementFor = (clipId: string): HTMLVideoElement | HTMLAudioElement | null => {
    const clip = clips.find((c) => c.id === clipId);
    if (!clip || clip.kind !== 'media') return null;
    const asset = clip.assetId ? assets.find((a) => a.id === clip.assetId) : undefined;
    if (!asset || !asset.url) return null;
    if (asset.kind === 'image') return null;
    return pool.get(clip.id, asset);
  };

  const drawFrame = async (t: number): Promise<void> => {
    const active = clips.filter(
      (c) => c.kind === 'media' && t >= c.start - 1e-6 && t < c.start + c.duration + 1e-6,
    );
    for (const c of clips) {
      const tr = c.transitionIn;
      if (tr && t >= c.start && t < c.start + tr.duration) {
        const prev = clips
          .filter((x) => x.kind === 'media' && x.trackId === c.trackId && x.start + x.duration <= c.start + 0.001)
          .sort((a, b) => b.start + b.duration - (a.start + a.duration))[0];
        if (prev && !active.includes(prev)) active.push(prev);
      }
    }
    // bağlı maske klipleri de seek edilir (kendi aralığındaysa)
    for (const c of clips) {
      if (!c.maskClipId) continue;
      const mc = clips.find((x) => x.id === c.maskClipId);
      if (
        mc &&
        mc.kind === 'media' &&
        t >= mc.start - 1e-6 &&
        t < mc.start + mc.duration + 1e-6 &&
        !active.includes(mc)
      ) {
        active.push(mc);
      }
    }
    await Promise.all(
      active.map(async (clip) => {
        const el = elementFor(clip.id);
        if (!el) return;
        await ExportPool.waitReady(el);
        await ExportPool.seekTo(el, sourceTime(clip, t));
      }),
    );
    // animasyonlu maske videolarını da bu karenin zamanına sar
    for (const clip of clips) {
      if (!clip.mask.enabled || clip.mask.shape !== 'video' || !clip.mask.videoAssetId) continue;
      if (t < clip.start - 1e-6 || t >= clip.start + clip.duration + 1e-6) continue;
      const mel = renderer.getMaskVideo(clip, assets);
      if (!mel) continue;
      const dur = Number.isFinite(mel.duration) && mel.duration > 0.1 ? mel.duration : 0;
      let mt = Math.max(0, t - clip.start);
      if (dur > 0) mt = mt % dur;
      await ExportPool.seekTo(mel, mt);
    }
    renderer.renderFrame(t, { settings, tracks, clips, assets, getElement: elementFor });
    outCtx.fillStyle = '#000';
    outCtx.fillRect(0, 0, W, H);
    outCtx.drawImage(renderCanvas, 0, 0, W, H);
  };

  if (isGif) {
    const gif = GIFEncoder();
    const totalFrames = Math.max(1, Math.ceil(duration * fps));
    const delay = Math.round(1000 / fps);
    for (let f = 0; f < totalFrames; f++) {
      if (opts.cancelRef.cancelled) {
        pool.destroy();
        throw new ExportCancelledError();
      }
      await drawFrame(Math.min(duration, f / fps));
      const rgba = outCtx.getImageData(0, 0, W, H).data;
      const palette = quantize(rgba, 256);
      const index = applyPalette(rgba, palette);
      gif.writeFrame(index, W, H, { palette, delay });
      opts.onProgress(0.02 + 0.95 * ((f + 1) / totalFrames), 'Kare ' + String(f + 1) + '/' + String(totalFrames));
    }
    gif.finish();
    pool.destroy();
    opts.onProgress(1, 'Tamamlandı');
    return { blob: new Blob([gif.bytesView() as unknown as BlobPart], { type: 'image/gif' }), fileName: outName };
  }

  const intermediate = FFMPEG_VIDEO.includes(opts.container);
  const format =
    !intermediate && opts.container === 'webm'
      ? new WebMOutputFormat()
      : !intermediate && opts.container === 'mkv'
        ? new MkvOutputFormat()
        : !intermediate && opts.container === 'mov'
          ? new MovOutputFormat()
          : new Mp4OutputFormat();

  const target = new BufferTarget();
  const output = new Output({ format, target });
  const videoSource = new CanvasSource(outCanvas, {
    codec: intermediate ? 'avc' : opts.videoCodec,
    quality: QUALITY_MAP[intermediate ? 'high' : opts.quality],
    keyFrameInterval: 2,
  });
  output.addVideoTrack(videoSource, { frameRate: fps });

  let audioSource: AudioBufferSource | null = null;
  if (mix && !intermediate) {
    const audioCodec = format instanceof WebMOutputFormat || format instanceof MkvOutputFormat ? 'opus' : 'aac';
    audioSource = new AudioBufferSource({ codec: audioCodec, bitrate: audioCodec === 'opus' ? 160000 : 192000 });
    output.addAudioTrack(audioSource);
  }

  await output.start();
  const totalFrames = Math.max(1, Math.ceil(duration * fps));
  try {
    for (let f = 0; f < totalFrames; f++) {
      if (opts.cancelRef.cancelled) throw new ExportCancelledError();
      const t = Math.min(duration, f / fps);
      await drawFrame(t);
      await videoSource.add(f / fps, 1 / fps);
      opts.onProgress(0.02 + 0.88 * ((f + 1) / totalFrames), 'Kare ' + String(f + 1) + '/' + String(totalFrames));
    }
    if (audioSource && mix) {
      opts.onProgress(0.92, 'Ses ekleniyor');
      await audioSource.add(mix);
    }
    opts.onProgress(0.95, 'Dosya yazılıyor');
    await output.finalize();
  } catch (err) {
    try {
      await output.cancel();
    } catch {
      // yok say
    }
    pool.destroy();
    throw err;
  }
  pool.destroy();
  const mp4Buffer = target.buffer!;

  if (intermediate) {
    const ff = await getFFmpeg((s) => opts.onProgress(0.96, s));
    await ff.writeFile('in.mp4', new Uint8Array(mp4Buffer));
    if (opts.cancelRef.cancelled) throw new ExportCancelledError();
    opts.onProgress(0.97, 'Format dönüştürülüyor');
    const outFile = await ffmpegConvertVideo(ff, opts.container);
    if (opts.cancelRef.cancelled) throw new ExportCancelledError();
    const data = await ff.readFile(outFile);
    opts.onProgress(1, 'Tamamlandı');
    return { blob: new Blob([data], { type: 'application/octet-stream' }), fileName: outName };
  }

  opts.onProgress(1, 'Tamamlandı');
  return {
    blob: new Blob([mp4Buffer], { type: NATIVE_MIME[opts.container] ?? 'video/mp4' }),
    fileName: outName,
  };
}

export async function saveResult(blob: Blob, fileName: string): Promise<'saved' | 'downloaded' | 'cancelled'> {
  const picker = (window as Window & { showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle> })
    .showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({ suggestedName: fileName });
      const writable = await (
        handle as FileSystemFileHandle & { createWritable: () => Promise<FileSystemWritableFileStream> }
      ).createWritable();
      await writable.write(blob);
      await writable.close();
      return 'saved';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
  return 'downloaded';
}
