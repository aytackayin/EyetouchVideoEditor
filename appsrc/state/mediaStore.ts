import { create } from 'zustand';
import type { BundledAssetMeta, MediaAsset } from '../types';
import {
  cleanupLegacyDb,
  deleteFileBlob,
  deleteStripBlob,
  deleteThumbBlob,
  loadAssetRecords,
  loadFileBlob,
  loadStripBlob,
  loadThumbBlob,
  saveAssetRecords,
  saveFileBlob,
  saveStripBlob,
  saveThumbBlob,
} from '../media/storage';
import { importFile } from '../media/importMedia';
import { uid } from '../utils';

interface MediaState {
  assets: MediaAsset[];
  importing: boolean;
  importErrors: string[];
  restore: () => Promise<void>;
  addFiles: (files: File[]) => Promise<void>;
  addImageBlob: (blob: Blob, name: string) => Promise<string | null>;
  removeAsset: (id: string) => Promise<void>;
  /** Tüm medyayı kalıcı olarak temizler (Yeni Proje). */
  clearAll: () => Promise<void>;
  /** Paketli .evproj içinden medyayı geri yükler (id'ler korunur). */
  restoreBundleAssets: (items: Array<{ meta: BundledAssetMeta; file: File }>) => Promise<void>;
  clearImportErrors: () => void;
}

let restoreDone = false;

export const useMediaStore = create<MediaState>((set, get) => ({
  assets: [],
  importing: false,
  importErrors: [],

  restore: async () => {
    if (restoreDone) return;
    restoreDone = true;
    void cleanupLegacyDb();
    const records = await loadAssetRecords();
    const assets: MediaAsset[] = [];
    for (const r of records) {
      const file = await loadFileBlob(r.id);
      if (!file) continue;
      const thumb = await loadThumbBlob(r.id);
      const strip = await loadStripBlob(r.id);
      assets.push({
        ...r,
        url: URL.createObjectURL(file),
        thumbUrl: thumb ? URL.createObjectURL(thumb) : undefined,
        stripUrl: strip ? URL.createObjectURL(strip) : undefined,
        stripFrames: r.stripFrames ?? (strip ? 8 : undefined),
        stripStep: r.stripStep,
      });
    }
    set({ assets });
  },

  addFiles: async (files) => {
    if (files.length === 0 || get().importing) return;
    set({ importing: true, importErrors: [] });
    const failed: string[] = [];
    try {
      for (const file of files) {
        try {
          const result = await importFile(file);
          if (!result) {
            failed.push(file.name);
            continue;
          }
          await saveFileBlob(result.asset.id, file);
          if (result.thumb) await saveThumbBlob(result.asset.id, result.thumb);
          if (result.strip) await saveStripBlob(result.asset.id, result.strip.blob);
          const assets = [...get().assets, result.asset];
          set({ assets });
          await saveAssetRecords(assets);
        } catch (err) {
          console.error('Medya içe aktarma hatası:', file.name, err);
          failed.push(file.name);
        }
      }
    } finally {
      set({ importing: false, importErrors: failed });
    }
  },

  /** Freeze frame gibi üretilmiş görselleri medya kutusuna ekler. */
  addImageBlob: async (blob, name) => {
    const asset: MediaAsset = {
      id: uid(),
      name,
      kind: 'image',
      mimeType: 'image/png',
      sizeBytes: blob.size,
      duration: 0,
      width: 0,
      height: 0,
      hasAudio: false,
      createdAt: Date.now(),
      url: URL.createObjectURL(blob),
      thumbUrl: URL.createObjectURL(blob),
    };
    try {
      const bmp = await createImageBitmap(blob);
      asset.width = bmp.width;
      asset.height = bmp.height;
      bmp.close();
    } catch {
      // boyut bilinmeden devam
    }
    await saveFileBlob(asset.id, blob);
    await saveThumbBlob(asset.id, blob);
    const assets = [...get().assets, asset];
    set({ assets });
    await saveAssetRecords(assets);
    return asset.id;
  },

  removeAsset: async (id) => {
    const asset = get().assets.find((a) => a.id === id);
    if (asset) {
      if (asset.url) URL.revokeObjectURL(asset.url);
      if (asset.thumbUrl && asset.thumbUrl !== asset.url) URL.revokeObjectURL(asset.thumbUrl);
      if (asset.stripUrl) URL.revokeObjectURL(asset.stripUrl);
    }
    const assets = get().assets.filter((a) => a.id !== id);
    set({ assets });
    await Promise.all([deleteFileBlob(id), deleteThumbBlob(id), deleteStripBlob(id)]);
    await saveAssetRecords(assets);
  },

  clearAll: async () => {
    for (const a of get().assets) {
      if (a.url) URL.revokeObjectURL(a.url);
      if (a.thumbUrl && a.thumbUrl !== a.url) URL.revokeObjectURL(a.thumbUrl);
      if (a.stripUrl) URL.revokeObjectURL(a.stripUrl);
      await Promise.all([deleteFileBlob(a.id), deleteThumbBlob(a.id), deleteStripBlob(a.id)]);
    }
    set({ assets: [] });
    await saveAssetRecords([]);
  },

  restoreBundleAssets: async (items) => {
    if (items.length === 0) return;
    for (const { meta, file } of items) {
      try {
        const result = await importFile(file, { id: meta.id });
        if (!result) {
          // dosya çözümlenemedi — üst veriyle kayıt oluştur, içerik boş kalır
          const asset: MediaAsset = {
            id: meta.id,
            name: meta.name,
            kind: meta.kind,
            mimeType: meta.mimeType || 'application/octet-stream',
            sizeBytes: meta.sizeBytes,
            duration: meta.duration,
            width: meta.width,
            height: meta.height,
            hasAudio: meta.hasAudio,
            createdAt: meta.createdAt,
            url: URL.createObjectURL(file),
          };
          await saveFileBlob(meta.id, file);
          set({ assets: [...get().assets, asset] });
          continue;
        }
        await saveFileBlob(result.asset.id, file);
        if (result.thumb) await saveThumbBlob(result.asset.id, result.thumb);
        if (result.strip) await saveStripBlob(result.asset.id, result.strip.blob);
        // Paket üst verisi daha güvenilir alanları öne alır (ör. süre 0 ölçüldüyse)
        const a = result.asset;
        const merged: MediaAsset = {
          ...a,
          duration: a.duration > 0.01 ? a.duration : meta.duration,
          width: a.width || meta.width,
          height: a.height || meta.height,
        };
        set({ assets: [...get().assets, merged] });
      } catch (err) {
        console.error('Paket medyası geri yüklenemedi:', meta.name, err);
      }
    }
    await saveAssetRecords(get().assets);
  },

  clearImportErrors: () => set({ importErrors: [] }),
}));
