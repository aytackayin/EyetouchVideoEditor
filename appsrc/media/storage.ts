import { createStore, get, set, del } from 'idb-keyval';
import type { MediaAsset, ProjectDoc } from '../types';

/**
 * Kalıcı depolama — sayfa yenilense bile hiçbir şey kaybolmaz.
 * Her createStore KENDİ veritabanını açar (ev-blobs, ev-meta).
 */

const blobStore = createStore('ev-blobs', 'blobs');
const metaStore = createStore('ev-meta', 'meta');

const KEY_ASSETS = 'assets';
const KEY_PROJECT = 'project';

type PersistableAsset = Omit<MediaAsset, 'url' | 'thumbUrl' | 'stripUrl'>;

function stripAsset(a: MediaAsset): PersistableAsset {
  const { url: _url, thumbUrl: _thumbUrl, stripUrl: _stripUrl, ...rest } = a;
  return rest;
}

/** Eski düzenden kalan bozuk ev-db'yi temizle (bir kez, sessizce). */
export async function cleanupLegacyDb(): Promise<void> {
  try {
    indexedDB.deleteDatabase('ev-db');
  } catch {
    // yok say
  }
}

export async function saveFileBlob(id: string, blob: Blob): Promise<void> {
  await set(`file:${id}`, blob, blobStore);
}

export async function loadFileBlob(id: string): Promise<Blob | undefined> {
  return (await get(`file:${id}`, blobStore)) as Blob | undefined;
}

export async function deleteFileBlob(id: string): Promise<void> {
  await del(`file:${id}`, blobStore);
}

export async function saveThumbBlob(id: string, blob: Blob): Promise<void> {
  await set(`thumb:${id}`, blob, blobStore);
}

export async function loadThumbBlob(id: string): Promise<Blob | undefined> {
  return (await get(`thumb:${id}`, blobStore)) as Blob | undefined;
}

export async function deleteThumbBlob(id: string): Promise<void> {
  await del(`thumb:${id}`, blobStore);
}

export async function saveStripBlob(id: string, blob: Blob): Promise<void> {
  await set(`strip:${id}`, blob, blobStore);
}

export async function loadStripBlob(id: string): Promise<Blob | undefined> {
  return (await get(`strip:${id}`, blobStore)) as Blob | undefined;
}

export async function deleteStripBlob(id: string): Promise<void> {
  await del(`strip:${id}`, blobStore);
}

export async function saveAssetRecords(assets: MediaAsset[]): Promise<void> {
  await set(KEY_ASSETS, assets.map(stripAsset), metaStore);
}

export async function loadAssetRecords(): Promise<PersistableAsset[]> {
  return ((await get(KEY_ASSETS, metaStore)) as PersistableAsset[] | undefined) ?? [];
}

export async function saveProjectDoc(doc: ProjectDoc): Promise<void> {
  await set(KEY_PROJECT, doc, metaStore);
}

export async function loadProjectDoc(): Promise<ProjectDoc | undefined> {
  return (await get(KEY_PROJECT, metaStore)) as ProjectDoc | undefined;
}
