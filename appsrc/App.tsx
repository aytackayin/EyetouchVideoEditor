import { useEffect, useLayoutEffect, useState } from 'react';
import { useMediaStore } from './state/mediaStore';
import { timelineDuration, useProjectStore } from './state/projectStore';
import { useUiStore, type CtxMenuItem } from './state/uiStore';
import { playback } from './engine/playback';
import { TopBar } from './components/TopBar';
import { MediaBin } from './components/MediaBin';
import { PreviewPanel } from './components/PreviewPanel';
import { Inspector } from './components/Inspector';
import { TimelinePanel } from './components/TimelinePanel';
import { SettingsModal } from './components/SettingsModal';
import { ExportDialog } from './components/ExportDialog';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { ConfirmDialog, ContextMenu } from './components/controls';
import { Logo } from './components/Logo';
import { tSync } from './i18n';

function Splash() {
  return (
    <div className="splash">
      <Logo />
      <div className="splash-spinner" />
    </div>
  );
}

/** Global klavye kısayolları */
function useKeyboardShortcuts(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
      ) {
        return;
      }
      const p = useProjectStore.getState();
      const ui = useUiStore.getState();
      const mod = e.ctrlKey || e.metaKey;

      if (e.code === 'Space') {
        e.preventDefault();
        playback.toggle();
        return;
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) p.redo();
        else p.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        p.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const sel = ui.selectedClipIds;
        const newIds: string[] = [];
        for (const id of sel) {
          const c = p.clips.find((x) => x.id === id);
          if (!c) continue;
          const nid = p.duplicateClip(id);
          if (nid) {
            // kopyayı orijinalin sağına, ilk boşluğa yerleştir
            p.moveClip(nid, { trackId: c.trackId, start: c.start + c.duration });
            newIds.push(nid);
          }
        }
        if (newIds.length > 0) ui.selectClip(newIds[0]);
        return;
      }
      if (mod) return;

      switch (e.key.toLowerCase()) {
        case 'j':
          playback.jkl('j');
          break;
        case 'k':
          playback.jkl('k');
          break;
        case 'l':
          playback.jkl('l');
          break;
        case 's': {
          const sel = useUiStore.getState().selectedClipIds;
          for (const id of sel) p.splitClip(id, p.currentTime);
          break;
        }
        case 'm':
          p.addMarker(p.currentTime);
          break;
        case '?':
        case '/':
          ui.setShortcutsOpen(true);
          break;
        case 'delete':
        case 'backspace':
          if (ui.selectedClipIds.length > 0) {
            e.preventDefault();
            p.removeClips(ui.selectedClipIds);
            ui.selectClip(null);
          }
          break;
        case 't': {
          const id = p.addTextClip();
          if (id) {
            ui.selectClip(id);
            setTimeout(() => {
              const ta = document.querySelector('.inspector-body textarea');
              (ta as HTMLTextAreaElement | null)?.focus();
            }, 120);
          }
          break;
        }
        case 'escape':
          ui.selectClip(null);
          break;
        case 'arrowleft':
          e.preventDefault();
          if (e.shiftKey) playback.seek(playback.time - 1);
          else playback.stepFrames(-1);
          break;
        case 'arrowright':
          e.preventDefault();
          if (e.shiftKey) playback.seek(playback.time + 1);
          else playback.stepFrames(1);
          break;
        case 'home':
          playback.seek(0);
          break;
        case 'end':
          playback.seek(timelineDuration(p.clips));
          break;
        case '+':
        case '=':
          ui.setPxPerSec(ui.pxPerSec * 1.3);
          break;
        case '-':
          ui.setPxPerSec(ui.pxPerSec / 1.3);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

/** Alt tuşu: tekerlek-zoom için basılı tutulur; keyup'ta tarayıcı menüsü açılmasın. */
function useSwallowAltKey() {
  useEffect(() => {
    const swallow = (e: KeyboardEvent) => {
      if (e.key === 'Alt') e.preventDefault();
    };
    window.addEventListener('keydown', swallow);
    window.addEventListener('keyup', swallow);
    return () => {
      window.removeEventListener('keydown', swallow);
      window.removeEventListener('keyup', swallow);
    };
  }, []);
}

/** Tema: light/dark/system — kök elemana data-theme olarak uygulanır.
 * Layout-effect: çocuklardaki yeniden çizim efektlerinden ÖNCE attrs uygulanır
 * (cetvel canvas'ı tema değişkenlerini çizerken doğru değerleri okur). */
function useApplyTheme() {
  const theme = useUiStore((s) => s.theme);
  useLayoutEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      const eff = theme === 'system' ? (mq.matches ? 'light' : 'dark') : theme;
      document.documentElement.dataset.theme = eff;
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

/**
 * Uygulamaya özgü sağ tık menüsü: tarayıcı menüsü engellenir; hedefe göre
 * klip / zaman çizgisi / genel öğeleri sunulur. Metin girişlerinde
 * kopyala-yapıştır için yerel menü bırakılır.
 */
function buildContextMenu(e: React.MouseEvent) {
  const target = e.target as HTMLElement;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return; // yerel menü

  e.preventDefault();
  const p = useProjectStore.getState();
  const ui = useUiStore.getState();

  const clipEl = target.closest('.tl-clip') as HTMLElement | null;
  if (clipEl?.dataset.clipId) {
    const clip = p.clips.find((c) => c.id === clipEl.dataset.clipId);
    if (!clip) return;
    ui.selectClip(clip.id, e.ctrlKey || e.shiftKey);
    const canSplit =
      p.currentTime > clip.start + 0.2 && p.currentTime < clip.start + clip.duration - 0.2;
    const items: CtxMenuItem[] = [
      {
        label: tSync('ctx.split'),
        disabled: !canSplit,
        onClick: () => p.splitClip(clip.id, useProjectStore.getState().currentTime),
      },
      {
        label: tSync('ctx.duplicate'),
        onClick: () => {
          const p2 = useProjectStore.getState();
          const nid = p2.duplicateClip(clip.id);
          if (nid) {
            p2.moveClip(nid, { trackId: clip.trackId, start: clip.start + clip.duration });
            useUiStore.getState().selectClip(nid);
          }
        },
      },
      { sep: true },
      {
        label: tSync('ctx.delete'),
        danger: true,
        onClick: () => {
          useProjectStore.getState().removeClips([clip.id]);
          useUiStore.getState().selectClip(null);
        },
      },
    ];
    ui.openCtxMenu(e.clientX, e.clientY, items);
    return;
  }

  if (target.closest('.tl-lane') || target.closest('.tl-ruler') || target.closest('.tl-scroll')) {
    const items: CtxMenuItem[] = [
      {
        label: tSync('ctx.addText'),
        onClick: () => {
          const id = useProjectStore.getState().addTextClip();
          if (id) useUiStore.getState().selectClip(id);
        },
      },
      {
        label: tSync('ctx.addMarker'),
        onClick: () => useProjectStore.getState().addMarker(useProjectStore.getState().currentTime),
      },
      { sep: true },
      {
        label: tSync('ctx.undo'),
        disabled: p.past.length === 0,
        onClick: () => useProjectStore.getState().undo(),
      },
      {
        label: tSync('ctx.redo'),
        disabled: p.future.length === 0,
        onClick: () => useProjectStore.getState().redo(),
      },
    ];
    ui.openCtxMenu(e.clientX, e.clientY, items);
    return;
  }

  const items: CtxMenuItem[] = [
    {
      label: tSync('ctx.undo'),
      disabled: p.past.length === 0,
      onClick: () => useProjectStore.getState().undo(),
    },
    {
      label: tSync('ctx.redo'),
      disabled: p.future.length === 0,
      onClick: () => useProjectStore.getState().redo(),
    },
    { sep: true },
    { label: tSync('ctx.shortcuts'), onClick: () => useUiStore.getState().setShortcutsOpen(true) },
    { label: tSync('ctx.settings'), onClick: () => useUiStore.getState().setSettingsOpen(true) },
  ];
  ui.openCtxMenu(e.clientX, e.clientY, items);
}

/** Medya kutusu ile önizleme arasındaki dikey ayırıcı — sürükleyince genişlik değişir. */
function MediaBinDivider() {
  const setMediaBinWidth = useUiStore((s) => s.setMediaBinWidth);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    const startX = e.clientX;
    const startW = useUiStore.getState().mediaBinWidth;
    try { el.setPointerCapture(e.pointerId); } catch { /* yok say */ }
    el.classList.add('dragging');
    const move = (ev: PointerEvent) => {
      setMediaBinWidth(startW + (ev.clientX - startX));
      // önizleme çerçevesi RO'suz ortamlarda yeniden ölçsün
      window.dispatchEvent(new Event('resize'));
    };
    const up = () => {
      el.classList.remove('dragging');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return <div className="media-divider" onPointerDown={onPointerDown} role="separator" aria-orientation="vertical" />;
}

export default function App() {
  const [booted, setBooted] = useState(false);
  const settingsOpen = useUiStore((s) => s.settingsOpen);
  const exportOpen = useUiStore((s) => s.exportOpen);
  const shortcutsOpen = useUiStore((s) => s.shortcutsOpen);
  const confirmDlg = useUiStore((s) => s.confirmDlg);
  const mediaBinWidth = useUiStore((s) => s.mediaBinWidth);

  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.all([
        useMediaStore.getState().restore(),
        useProjectStore.getState().restore(),
      ]);
      if (alive) {
        playback.init();
        playback.seek(useProjectStore.getState().currentTime);
        setBooted(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  useKeyboardShortcuts(booted);
  useSwallowAltKey();
  useApplyTheme();

  if (!booted) return <Splash />;

  return (
    <div className="app" onContextMenu={buildContextMenu}>
      <TopBar />
      <div
        className="main"
        style={{ '--media-w': `${mediaBinWidth}px` } as React.CSSProperties}
      >
        <MediaBin />
        <MediaBinDivider />
        <PreviewPanel />
        <Inspector />
      </div>
      <TimelinePanel />
      {settingsOpen && <SettingsModal />}
      {exportOpen && <ExportDialog />}
      {shortcutsOpen && <ShortcutsDialog />}
      {confirmDlg && <ConfirmDialog />}
      <ContextMenu />
    </div>
  );
}
