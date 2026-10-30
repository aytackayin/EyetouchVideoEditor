import { create } from 'zustand';
import type { Lang } from '../i18n';

export type Theme = 'light' | 'dark' | 'system';

export interface CtxMenuItem {
  label?: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  sep?: boolean;
}

export interface CtxMenuState {
  x: number;
  y: number;
  items: CtxMenuItem[];
}

export interface ConfirmState {
  title: string;
  message: string;
  okLabel?: string;
  danger?: boolean;
  onOk: () => void;
}

/**
 * UI tercihleri — kalıcı kısımları localStorage'da saklanır.
 */
interface UiState {
  lang: Lang;
  theme: Theme;
  timelineHeight: number;
  mediaBinWidth: number;
  settingsOpen: boolean;
  exportOpen: boolean;
  shortcutsOpen: boolean;
  selectedClipIds: string[];
  tool: 'select' | 'razor';
  snap: boolean;
  pxPerSec: number;
  masterVolume: number;
  ctxMenu: CtxMenuState | null;
  confirmDlg: ConfirmState | null;
  setLang: (lang: Lang) => void;
  setTheme: (theme: Theme) => void;
  setTimelineHeight: (h: number) => void;
  setMediaBinWidth: (w: number) => void;
  setSettingsOpen: (open: boolean) => void;
  setExportOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  selectClip: (id: string | null, additive?: boolean) => void;
  setTool: (tool: UiState['tool']) => void;
  toggleSnap: () => void;
  setSnap: (v: boolean) => void;
  setPxPerSec: (v: number) => void;
  setMasterVolume: (v: number) => void;
  openCtxMenu: (x: number, y: number, items: CtxMenuItem[]) => void;
  closeCtxMenu: () => void;
  openConfirm: (c: ConfirmState) => void;
  closeConfirm: () => void;
}

const LS_KEY = 'ev-ui-prefs';

interface PersistPrefs {
  lang: Lang;
  theme: Theme;
  timelineHeight: number;
  mediaBinWidth: number;
  tool: UiState['tool'];
  snap: boolean;
  pxPerSec: number;
  masterVolume: number;
}

function clampHeight(h: number): number {
  return Math.min(600, Math.max(160, Math.round(h)));
}

function clampMediaWidth(w: number): number {
  return Math.min(520, Math.max(200, Math.round(w)));
}

export function clampZoom(v: number): number {
  return Math.min(1000, Math.max(4, v));
}

function normTheme(v: unknown): Theme {
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'dark';
}

function loadPrefs(): PersistPrefs {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<PersistPrefs>;
      return {
        lang: p.lang === 'en' ? 'en' : 'tr',
        theme: normTheme(p.theme),
        timelineHeight: clampHeight(p.timelineHeight ?? 280),
        mediaBinWidth: clampMediaWidth(p.mediaBinWidth ?? 272),
        tool: p.tool === 'razor' ? 'razor' : 'select',
        snap: p.snap !== false,
        pxPerSec: clampZoom(p.pxPerSec ?? 60),
        masterVolume: Math.min(1, Math.max(0, p.masterVolume ?? 1)),
      };
    }
  } catch {
    // bozuk kayıt — varsayılanla devam
  }
  return { lang: 'tr', theme: 'dark', timelineHeight: 280, mediaBinWidth: 272, tool: 'select', snap: true, pxPerSec: 60, masterVolume: 1 };
}

function persist(s: UiState): void {
  const prefs: PersistPrefs = {
    lang: s.lang,
    theme: s.theme,
    timelineHeight: s.timelineHeight,
    mediaBinWidth: s.mediaBinWidth,
    tool: s.tool,
    snap: s.snap,
    pxPerSec: s.pxPerSec,
    masterVolume: s.masterVolume,
  };
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage kullanılamıyorsa sessizce geç
  }
}

const initial = loadPrefs();

export const useUiStore = create<UiState>((set, get) => ({
  lang: initial.lang,
  theme: initial.theme,
  timelineHeight: initial.timelineHeight,
  mediaBinWidth: initial.mediaBinWidth,
  settingsOpen: false,
  exportOpen: false,
  shortcutsOpen: false,
  selectedClipIds: [],
  tool: initial.tool,
  snap: initial.snap,
  pxPerSec: initial.pxPerSec,
  masterVolume: initial.masterVolume,
  ctxMenu: null,
  confirmDlg: null,
  setLang: (lang) => {
    set({ lang });
    persist(get());
  },
  setTheme: (theme) => {
    set({ theme });
    persist(get());
  },
  setTimelineHeight: (h) => {
    set({ timelineHeight: clampHeight(h) });
    persist(get());
  },
  setMediaBinWidth: (w) => {
    set({ mediaBinWidth: clampMediaWidth(w) });
    persist(get());
  },
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setExportOpen: (open) => set({ exportOpen: open }),
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
  selectClip: (id, additive = false) => {
    if (id === null) {
      set({ selectedClipIds: [] });
      return;
    }
    set((s) => {
      if (additive) {
        const has = s.selectedClipIds.includes(id);
        return { selectedClipIds: has ? s.selectedClipIds.filter((x) => x !== id) : [...s.selectedClipIds, id] };
      }
      return { selectedClipIds: [id] };
    });
  },
  setTool: (tool) => {
    set({ tool });
    persist(get());
  },
  toggleSnap: () => {
    set((s) => ({ snap: !s.snap }));
    persist(get());
  },
  setSnap: (v) => {
    set({ snap: v });
    persist(get());
  },
  setPxPerSec: (v) => {
    set({ pxPerSec: clampZoom(v) });
    persist(get());
  },
  setMasterVolume: (v) => {
    set({ masterVolume: Math.min(1, Math.max(0, v)) });
    persist(get());
  },
  openCtxMenu: (x, y, items) => set({ ctxMenu: { x, y, items } }),
  closeCtxMenu: () => set({ ctxMenu: null }),
  openConfirm: (c) => set({ ctxMenu: null, confirmDlg: c }),
  closeConfirm: () => set({ confirmDlg: null }),
}));
