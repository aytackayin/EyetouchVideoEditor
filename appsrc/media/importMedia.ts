import type { MediaAsset, MediaKind } from '../types';
import { uid } from '../utils';

/**
 * Medya içe aktarma: dosyayı analiz eder (süre/boyut), küçük resim, dalga formu
 * ve filmstrip sprite (8 kare) üretir. Asset döndürür; kalıcı kayıt mediaStore
 * tarafından yapılır.
 */
export interface ImportResult {
  asset: MediaAsset;
  thumb?: Blob;
  strip?: { blob: Blob; frames: number; step: number };
}

const VIDEO_EXT = ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'mpg', 'mpeg', 'ts', 'wmv', 'flv', '3gp'];
const AUDIO_EXT = ['mp3', 'wav', 'aac', 'flac', 'ogg', 'oga', 'm4a', 'opus', 'aiff', 'wma'];
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'tiff'];

const STRIP_MAX_FRAMES = 20;
const STRIP_TARGET_STEP = 0.5; // saniye — kısa videolarda yarım saniyede bir kare

export function detectKind(file: File): MediaKind | null {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('image/')) return 'image';
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (VIDEO_EXT.includes(ext)) return 'video';
  if (AUDIO_EXT.includes(ext)) return 'audio';
  if (IMAGE_EXT.includes(ext)) return 'image';
  return null;
}

function waitEvent(el: HTMLElement, event: string, timeoutMs = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    const onDone = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error(`${event} failed`)); };
    const onTimeout = () => { cleanup(); reject(new Error(`${event} timeout`)); };
    const cleanup = () => {
      el.removeEventListener(event, onDone);
      el.removeEventListener('error', onError);
      clearTimeout(timer);
    };
    const timer = setTimeout(onTimeout, timeoutMs);
    el.addEventListener(event, onDone, { once: true });
    el.addEventListener('error', onError, { once: true });
  });
}

/** Video için ses kanalı var mı — captureStream ile hızlı kestirim. */
function probeHasAudioTrack(video: HTMLVideoElement): boolean {
  try {
    const ms = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
    return !!ms && ms.getAudioTracks().length > 0;
  } catch {
    return true;
  }
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => { video.removeEventListener('seeked', done); clearTimeout(timer); resolve(); };
    const timer = setTimeout(done, 3000);
    video.addEventListener('seeked', done, { once: true });
    try {
      video.currentTime = Math.max(0, t);
    } catch {
      done();
    }
  });
}

function drawTo(canvas: HTMLCanvasElement, video: HTMLVideoElement, w: number, h: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(video, 0, 0, w, h);
}

function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.82): Promise<Blob | undefined> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? undefined), 'image/jpeg', quality));
}

/**
 * Filmstrip sprite'ı üretir: kaynağın BAŞINDAN itibaren sabit adımla kare örnekleri.
 * Kısa videolarda yarım saniyede bir kare; uzun videolarda adım büyür (en fazla 20 kare).
 * Dönen `step` = kareler arası kaynak zaman adımı — şerit çizimi bunu kullanır.
 */
async function makeFilmstrip(
  video: HTMLVideoElement,
  duration: number,
): Promise<{ blob: Blob; frames: number; step: number } | undefined> {
  try {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh || duration <= 0.1) return undefined;
    const step = Math.max(STRIP_TARGET_STEP, duration / STRIP_MAX_FRAMES);
    const frames = Math.max(2, Math.min(STRIP_MAX_FRAMES, Math.ceil(duration / step)));
    const th = 96; // şerit karesi yüksekliği
    const tw = Math.max(24, Math.round((vw / vh) * th));
    const canvas = document.createElement('canvas');
    canvas.width = tw * frames;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    for (let i = 0; i < frames; i++) {
      const t = Math.min(i * step, Math.max(0, duration - 0.05));
      if (Math.abs(video.currentTime - t) > 0.03) await seek(video, t);
      if (video.readyState >= 2) {
        ctx.drawImage(video, i * tw, 0, tw, th);
      } else {
        ctx.fillStyle = '#101216';
        ctx.fillRect(i * tw, 0, tw, th);
      }
    }
    const blob = await canvasToBlob(canvas, 0.75);
    return blob ? { blob, frames, step } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Ses verisini çözüp dalga formu tepe değerlerini hesaplar.
 */
export async function extractWaveform(file: File): Promise<Float32Array | undefined> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const AC: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new AC();
    const buf = await ac.decodeAudioData(arrayBuffer);
    void ac.close();
    const buckets = Math.min(2400, Math.max(60, Math.floor(buf.duration * 20)));
    const data = buf.getChannelData(0);
    const peaks = new Float32Array(buckets);
    const size = Math.max(1, Math.floor(data.length / buckets));
    const stride = Math.max(1, Math.floor(size / 64));
    for (let i = 0; i < buckets; i++) {
      let max = 0;
      const off = i * size;
      const end = Math.min(data.length, off + size);
      for (let j = off; j < end; j += stride) {
        const v = Math.abs(data[j]);
        if (v > max) max = v;
      }
      peaks[i] = max;
    }
    return peaks;
  } catch {
    return undefined;
  }
}

async function importVideo(file: File, url: string, forceId?: string): Promise<ImportResult> {
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  try {
    await waitEvent(video, 'loadedmetadata');
  } catch {
    throw new Error('metadata okunamadı');
  }
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const hasAudio = duration > 0 ? probeHasAudioTrack(video) : true;

  let thumb: Blob | undefined;
  let strip: { blob: Blob; frames: number; step: number } | undefined;
  if (duration > 0) {
    try {
      await seek(video, Math.min(Math.max(duration * 0.1, 0.1), Math.max(duration - 0.05, 0)));
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw && vh) {
        const scale = Math.min(1, 320 / vw);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(2, Math.round(vw * scale));
        canvas.height = Math.max(2, Math.round(vh * scale));
        drawTo(canvas, video, canvas.width, canvas.height);
        thumb = await canvasToBlob(canvas);
      }
      strip = await makeFilmstrip(video, duration);
    } catch {
      // küçük resim/filmstrip başarısızsa klip ikonu gösterilir
    }
  }
  const waveform = await extractWaveform(file);
  return {
    asset: {
      id: forceId ?? uid(),
      name: file.name,
      kind: 'video',
      mimeType: file.type || 'video/mp4',
      sizeBytes: file.size,
      duration,
      width: video.videoWidth,
      height: video.videoHeight,
      hasAudio,
      createdAt: Date.now(),
      waveform,
      url,
      thumbUrl: thumb ? URL.createObjectURL(thumb) : undefined,
      stripUrl: strip ? URL.createObjectURL(strip.blob) : undefined,
      stripFrames: strip?.frames,
      stripStep: strip?.step,
    },
    thumb,
    strip,
  };
}

async function importAudio(file: File, url: string, forceId?: string): Promise<ImportResult> {
  const audio = document.createElement('audio');
  audio.preload = 'metadata';
  audio.src = url;
  try {
    await waitEvent(audio, 'loadedmetadata');
  } catch {
    throw new Error('metadata okunamadı');
  }
  const waveform = await extractWaveform(file);
  return {
    asset: {
      id: forceId ?? uid(),
      name: file.name,
      kind: 'audio',
      mimeType: file.type || 'audio/mpeg',
      sizeBytes: file.size,
      duration: Number.isFinite(audio.duration) ? audio.duration : 0,
      width: 0,
      height: 0,
      hasAudio: true,
      createdAt: Date.now(),
      waveform,
      url,
    },
  };
}

async function importImage(file: File, url: string, forceId?: string): Promise<ImportResult> {
  const img = new Image();
  img.src = url;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('görsel okunamadı'));
  });
  let thumb: Blob | undefined;
  try {
    const scale = Math.min(1, 320 / img.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(2, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      thumb = (await new Promise<Blob | undefined>((resolve) =>
        canvas.toBlob((b) => resolve(b ?? undefined), 'image/jpeg', 0.82),
      ))!;
    }
  } catch {
    // küçük resim olmadan devam
  }
  return {
    asset: {
      id: forceId ?? uid(),
      name: file.name,
      kind: 'image',
      mimeType: file.type || 'image/png',
      sizeBytes: file.size,
      duration: 0,
      width: img.naturalWidth,
      height: img.naturalHeight,
      hasAudio: false,
      createdAt: Date.now(),
      url,
      thumbUrl: thumb ? URL.createObjectURL(thumb) : url,
    },
    thumb,
  };
}

/** İçe aktar; `opts.id` verilirse asset o kimlikle oluşur (paket geri yükleme). */
export async function importFile(file: File, opts?: { id?: string }): Promise<ImportResult | null> {
  const kind = detectKind(file);
  if (!kind) return null;
  const url = URL.createObjectURL(file);
  try {
    if (kind === 'video') return await importVideo(file, url, opts?.id);
    if (kind === 'audio') return await importAudio(file, url, opts?.id);
    return await importImage(file, url, opts?.id);
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}
