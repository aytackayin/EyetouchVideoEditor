// Tum uygulamayi tek main.tsx dosyasinda uretir.
// Kullanim: node make-bundle.cjs && npm run build
// Volatil moduller bu dosyaya gomuludur; appsrc/da varsa dosyadan, yoksa gomuluden alinir.
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'appsrc');

const ORDER = [
  'types/index.ts',
  'utils/index.ts',
  'i18n/tr.ts',
  'i18n/en.ts',
  'i18n/index.ts',
  'media/storage.ts',
  'media/importMedia.ts',
  'media/projectBundle.ts',
  'media/audioCache.ts',
  'state/uiStore.ts',
  'state/mediaStore.ts',
  'state/projectStore.ts',
  'engine/renderer.ts',
  'engine/playback.ts',
  'exporter.ts',
  'components/Logo.tsx',
  'components/controls.tsx',
  'components/TopBar.tsx',
  'components/MediaBin.tsx',
  'components/PreviewPanel.tsx',
  'components/TransformOverlay.tsx',
  'components/Inspector.tsx',
  'components/TimelinePanel.tsx',
  'components/SettingsModal.tsx',
  'components/ShortcutsDialog.tsx',
  'components/ExportDialog.tsx',
  'App.tsx',
];

// ================= GOMULU MODULLER =================

const EMBEDDED = {};

EMBEDDED['i18n/index.ts'] = `
export type Lang = 'tr' | 'en';

const dicts = { tr, en } as const;

export function useT() {
  const lang = useUiStore((s: { lang: Lang }) => s.lang);
  return (key: string): string => (dicts[lang] as Record<string, string>)[key] ?? tr[key] ?? key;
}

export function tSync(key: string): string {
  const lang = useUiStore.getState().lang;
  return (dicts[lang] as Record<string, string>)[key] ?? tr[key] ?? key;
}
`;

EMBEDDED['media/storage.ts'] = `
const blobStore = createStore('ev-blobs', 'blobs');
const metaStore = createStore('ev-meta', 'meta');
const KEY_ASSETS = 'assets';
const KEY_PROJECT = 'project';

function stripAsset(a: MediaAsset): Omit<MediaAsset, 'url' | 'thumbUrl' | 'stripUrl' | 'stripFrames'> {
  const rest = { ...a } as Partial<MediaAsset>;
  delete rest.url; delete rest.thumbUrl; delete rest.stripUrl; delete rest.stripFrames;
  return rest as Omit<MediaAsset, 'url' | 'thumbUrl' | 'stripUrl' | 'stripFrames'>;
}

async function cleanupLegacyDb(): Promise<void> {
  try { indexedDB.deleteDatabase('ev-db'); } catch { /* yok say */ }
}
async function saveFileBlob(id: string, blob: Blob): Promise<void> { await set('file:' + id, blob, blobStore); }
async function loadFileBlob(id: string): Promise<Blob | undefined> { return (await get('file:' + id, blobStore)) as Blob | undefined; }
async function deleteFileBlob(id: string): Promise<void> { await del('file:' + id, blobStore); }
async function saveThumbBlob(id: string, blob: Blob): Promise<void> { await set('thumb:' + id, blob, blobStore); }
async function loadThumbBlob(id: string): Promise<Blob | undefined> { return (await get('thumb:' + id, blobStore)) as Blob | undefined; }
async function deleteThumbBlob(id: string): Promise<void> { await del('thumb:' + id, blobStore); }
async function saveStripBlob(id: string, blob: Blob): Promise<void> { await set('strip:' + id, blob, blobStore); }
async function loadStripBlob(id: string): Promise<Blob | undefined> { return (await get('strip:' + id, blobStore)) as Blob | undefined; }
async function saveAssetRecords(assets: MediaAsset[]): Promise<void> { await set(KEY_ASSETS, assets.map(stripAsset), metaStore); }
async function loadAssetRecords(): Promise<Omit<MediaAsset, 'url' | 'thumbUrl' | 'stripUrl' | 'stripFrames'>[]> {
  return ((await get(KEY_ASSETS, metaStore)) as Omit<MediaAsset, 'url' | 'thumbUrl' | 'stripUrl' | 'stripFrames'>[] | undefined) ?? [];
}
async function saveProjectDoc(doc: ProjectDoc): Promise<void> { await set(KEY_PROJECT, doc, metaStore); }
async function loadProjectDoc(): Promise<ProjectDoc | undefined> { return (await get(KEY_PROJECT, metaStore)) as ProjectDoc | undefined; }
`;

EMBEDDED['state/uiStore.ts'] = `
interface UiState {
  lang: Lang;
  timelineHeight: number;
  settingsOpen: boolean;
  exportOpen: boolean;
  shortcutsOpen: boolean;
  selectedClipIds: string[];
  tool: 'select' | 'razor';
  snap: boolean;
  pxPerSec: number;
  masterVolume: number;
  setLang: (lang: Lang) => void;
  setTimelineHeight: (h: number) => void;
  setSettingsOpen: (open: boolean) => void;
  setExportOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  selectClip: (id: string | null, additive?: boolean) => void;
  setTool: (tool: UiState['tool']) => void;
  toggleSnap: () => void;
  setSnap: (v: boolean) => void;
  setPxPerSec: (v: number) => void;
  setMasterVolume: (v: number) => void;
}

const LS_KEY = 'ev-ui-prefs';

function clampHeight(h: number): number { return Math.min(600, Math.max(160, Math.round(h))); }
function clampZoom(v: number): number { return Math.min(1000, Math.max(4, v)); }

function loadPrefs(): { lang: Lang; timelineHeight: number; tool: UiState['tool']; snap: boolean; pxPerSec: number; masterVolume: number } {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        lang: p.lang === 'en' ? 'en' : 'tr',
        timelineHeight: clampHeight(p.timelineHeight ?? 280),
        tool: p.tool === 'razor' ? 'razor' : 'select',
        snap: p.snap !== false,
        pxPerSec: clampZoom(p.pxPerSec ?? 60),
        masterVolume: Math.min(1, Math.max(0, p.masterVolume ?? 1)),
      };
    }
  } catch { /* bozuk kayit */ }
  return { lang: 'tr', timelineHeight: 280, tool: 'select', snap: true, pxPerSec: 60, masterVolume: 1 };
}

const initialPrefs = loadPrefs();

function persistPrefs(s: UiState): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      lang: s.lang, timelineHeight: s.timelineHeight, tool: s.tool,
      snap: s.snap, pxPerSec: s.pxPerSec, masterVolume: s.masterVolume,
    }));
  } catch { /* yok say */ }
}

const useUiStore = create<UiState>((set, get) => ({
  lang: initialPrefs.lang,
  timelineHeight: initialPrefs.timelineHeight,
  settingsOpen: false,
  exportOpen: false,
  shortcutsOpen: false,
  selectedClipIds: [],
  tool: initialPrefs.tool,
  snap: initialPrefs.snap,
  pxPerSec: initialPrefs.pxPerSec,
  masterVolume: initialPrefs.masterVolume,
  setLang: (lang) => { set({ lang }); persistPrefs(get()); },
  setTimelineHeight: (h) => { set({ timelineHeight: clampHeight(h) }); persistPrefs(get()); },
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setExportOpen: (open) => set({ exportOpen: open }),
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
  selectClip: (id, additive = false) => {
    if (id === null) { set({ selectedClipIds: [] }); return; }
    set((st) => {
      if (additive) {
        const has = st.selectedClipIds.includes(id);
        return { selectedClipIds: has ? st.selectedClipIds.filter((x) => x !== id) : [...st.selectedClipIds, id] };
      }
      return { selectedClipIds: [id] };
    });
  },
  setTool: (tool) => { set({ tool }); persistPrefs(get()); },
  toggleSnap: () => { set((st) => ({ snap: !st.snap })); persistPrefs(get()); },
  setSnap: (v) => { set({ snap: v }); persistPrefs(get()); },
  setPxPerSec: (v) => { set({ pxPerSec: clampZoom(v) }); persistPrefs(get()); },
  setMasterVolume: (v) => { set({ masterVolume: Math.min(1, Math.max(0, v)) }); persistPrefs(get()); },
}));
`;

EMBEDDED['state/mediaStore.ts'] = `
interface MediaState {
  assets: MediaAsset[];
  importing: boolean;
  importErrors: string[];
  restore: () => Promise<void>;
  addFiles: (files: File[]) => Promise<void>;
  addImageBlob: (blob: Blob, name: string) => Promise<string | null>;
  removeAsset: (id: string) => Promise<void>;
  clearImportErrors: () => void;
}

let restoreDone = false;

const useMediaStore = create<MediaState>((set, get) => ({
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
        stripFrames: strip ? 8 : undefined,
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
          if (!result) { failed.push(file.name); continue; }
          await saveFileBlob(result.asset.id, file);
          if (result.thumb) await saveThumbBlob(result.asset.id, result.thumb);
          if (result.strip) await saveStripBlob(result.asset.id, result.strip.blob);
          const assets = [...get().assets, result.asset];
          set({ assets });
          await saveAssetRecords(assets);
        } catch (err) {
          console.error('Medya ice aktarma hatasi:', file.name, err);
          failed.push(file.name);
        }
      }
    } finally {
      set({ importing: false, importErrors: failed });
    }
  },

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
    } catch { /* boyut bilinmedi */ }
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
    await Promise.all([deleteFileBlob(id), deleteThumbBlob(id)]);
    await saveAssetRecords(assets);
  },

  clearImportErrors: () => set({ importErrors: [] }),
}));
`;

// ================= BIRLESTIRICI =================

const externals = new Map();

function addExternal(pkg, names, defaultName, isType) {
  if (!externals.has(pkg)) externals.set(pkg, { names: new Set(), defaults: new Set(), types: new Set() });
  const e = externals.get(pkg);
  for (const n of names) (isType ? e.types : e.names).add(n);
  if (defaultName) e.defaults.add(defaultName);
}

function processSource(text) {
  const lines = text.split('\n');
  const kept = [];
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (/^import\s/.test(t)) {
      let stmt = t;
      let j = i;
      while (
        !/from\s+['"][^'"]+['"];?\s*$/.test(stmt) &&
        !/^import\s+['"][^'"]+['"];?\s*$/.test(stmt) &&
        j + 1 < lines.length &&
        j - i < 40
      ) {
        j++;
        stmt += ' ' + lines[j].trim();
      }
      const fromM = stmt.match(/from\s+['"]([^'"]+)['"]/) || stmt.match(/^import\s+['"]([^'"]+)['"]/);
      if (fromM) {
        const pkg = fromM[1];
        if (pkg.startsWith('.')) { i = j + 1; continue; }
        const isType = /^import\s+type\s/.test(stmt);
        const namedM = stmt.match(/\{([^}]+)\}/);
        if (namedM) {
          const names = namedM[1].split(',').map((x) => x.trim().replace(/^type\s+/, '')).filter(Boolean);
          addExternal(pkg, names, null, isType);
        }
        const defM = stmt.match(/^import\s+([A-Za-z_$][\w$]*)\s*(?:,|from)/);
        if (defM) addExternal(pkg, [], defM[1], false);
        i = j + 1;
        continue;
      }
    }
    kept.push(lines[i]);
    i++;
  }
  let body = kept.join('\n');
  body = body.replace(/^export\s+type\s+\{[^}]*\};?\s*$/gm, '');
  body = body.replace(/^export\s+default\s+/gm, '@@DEFAULT@@ ');
  body = body.replace(/^export\s+/gm, '');
  body = body.replace(/^@@DEFAULT@@ /gm, 'export default ');
  return body.trim();
}

function loadModule(rel) {
  const p = path.join(SRC, rel);
  if (fs.existsSync(p)) {
    return fs.readFileSync(p, 'utf8');
  }
  if (EMBEDDED[rel]) return EMBEDDED[rel];
  return null;
}

const chunks = [];
let missing = 0;
for (const rel of ORDER) {
  const text = loadModule(rel);
  if (text === null) { console.error('EKSIK: ' + rel); missing++; continue; }
  chunks.push('// ================= ' + rel + ' =================\n' + processSource(text));
}

const importLines = [];
for (const [pkg, e] of externals) {
  const parts = [];
  if (e.defaults.size > 0) parts.push([...e.defaults].join(', '));
  const valueNames = [...e.names];
  if (valueNames.length > 0) parts.push('{ ' + valueNames.join(', ') + ' }');
  if (parts.length > 0) importLines.push('import ' + parts.join(', ') + ' from ' + JSON.stringify(pkg) + ';');
  const typeNames = [...e.types];
  if (typeNames.length > 0) importLines.push('import type { ' + typeNames.join(', ') + ' } from ' + JSON.stringify(pkg) + ';');
}

const banner = '// OTOMATIK OLUSTURULDU — node make-bundle.cjs (kaynak: appsrc/ + gomulu)' + String.fromCharCode(10);

const entry = [
  '// ================= main (giris) =================',
  "import React from 'react';",
  "import ReactDOM from 'react-dom/client';",
  "import { appStyles } from './app-styles';",
  "const styleEl = document.createElement('style');",
  'styleEl.textContent = appStyles;',
  'document.head.appendChild(styleEl);',
  '',
  '(window as unknown as { __dbg: unknown }).__dbg = { renderer, playback, useProjectStore, useMediaStore };',
  '',
  "ReactDOM.createRoot(document.getElementById('root')!).render(",
  '  <React.StrictMode>',
  '    <App />',
  '  </React.StrictMode>,',
  ');',
].join('\n');

const out = [banner, ...importLines, '', ...chunks, '', entry].join('\n\n');
fs.writeFileSync(path.join(ROOT, 'main.tsx'), out);
console.log('main.tsx:', out.length, 'karakter,', externals.size, 'paket,', missing, 'eksik modul');
