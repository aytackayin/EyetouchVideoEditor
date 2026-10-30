import { useState } from 'react';
import {
  Clapperboard,
  FileOutput,
  Images,
  Play,
  Redo2,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Undo2,
} from 'lucide-react';
import { useProjectStore } from '../state/projectStore';
import { useUiStore } from '../state/uiStore';
import { useT } from '../i18n';
import { Logo } from './Logo';
import { MediaBin } from './MediaBin';
import { PreviewPanel } from './PreviewPanel';
import { Inspector } from './Inspector';
import { TimelinePanel } from './TimelinePanel';

/**
 * Mobil arayüz (telefon + dikey tablet, <=820px): üstte kompakt başlık, ortada
 * aktif sekmenin paneli, altta 4'lü sekme çubuğu. Masaüstündeki tüm
 * bileşenler (önizleme, medya, zaman çizgisi, denetçi) aynen kullanılır;
 * yalnızca kabuk ve dokunma boyutları mobilcedir.
 */
type MTab = 'preview' | 'media' | 'timeline' | 'inspector';

export function MobileApp() {
  const t = useT();
  const [tab, setTab] = useState<MTab>('preview');
  const setExportOpen = useUiStore((s) => s.setExportOpen);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);

  const tabs: Array<{ id: MTab; label: string; icon: React.ReactNode }> = [
    { id: 'preview', label: t('preview.title'), icon: <Play size={20} /> },
    { id: 'media', label: t('media.title'), icon: <Images size={20} /> },
    { id: 'timeline', label: t('timeline.title'), icon: <Clapperboard size={20} /> },
    { id: 'inspector', label: t('inspector.title'), icon: <SlidersHorizontal size={20} /> },
  ];

  return (
    <div className="m-app">
      <header className="m-header">
        <Logo />
        <div className="spacer" />
        <button className="icon-btn" disabled={!canUndo} title={t('topbar.undo')} onClick={undo}>
          <Undo2 size={16} />
        </button>
        <button className="icon-btn" disabled={!canRedo} title={t('topbar.redo')} onClick={redo}>
          <Redo2 size={16} />
        </button>
        <button className="icon-btn" title={t('topbar.settings')} onClick={() => setSettingsOpen(true)}>
          <SettingsIcon size={16} />
        </button>
        <button className="btn accent" title={t('topbar.export')} onClick={() => setExportOpen(true)}>
          <FileOutput size={14} />
        </button>
      </header>
      <div className="m-content">
        {tab === 'preview' && <PreviewPanel />}
        {tab === 'media' && <MediaBin />}
        {tab === 'timeline' && <TimelinePanel fill />}
        {tab === 'inspector' && <Inspector />}
      </div>
      <nav className="m-tabbar">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            className={`m-tab ${tab === tb.id ? 'active' : ''}`}
            onClick={() => setTab(tb.id)}
          >
            {tb.icon}
            <span>{tb.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
