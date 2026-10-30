import { loadFileBlob } from './storage';
import type { MediaAsset } from '../types';

/**
 * Çözülmüş AudioBuffer önbelleği (export karıştırma ve gürültü azaltma için).
 * Dosya blob'undan decode edilir ve assetId ile saklanır.
 */
const cache = new Map<string, Promise<AudioBuffer | null>>();
let decodeCtx: AudioContext | null = null;

function getDecodeCtx(): AudioContext | null {
  if (decodeCtx && decodeCtx.state !== 'closed') return decodeCtx;
  const AC: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  try {
    decodeCtx = new AC();
    return decodeCtx;
  } catch {
    return null;
  }
}

export function getAudioBuffer(asset: MediaAsset): Promise<AudioBuffer | null> {
  const hit = cache.get(asset.id);
  if (hit) return hit;
  const p = (async () => {
    if (!asset.hasAudio || asset.kind === 'image') return null;
    const blob = await loadFileBlob(asset.id);
    if (!blob) return null;
    const ctx = getDecodeCtx();
    if (!ctx) return null;
    try {
      const arr = await blob.arrayBuffer();
      return await ctx.decodeAudioData(arr);
    } catch {
      return null;
    }
  })();
  cache.set(asset.id, p);
  return p;
}
