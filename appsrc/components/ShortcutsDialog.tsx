import { X } from 'lucide-react';
import { useUiStore } from '../state/uiStore';
import { useT } from '../i18n';
import type { DictKey } from '../i18n';

const GROUPS: Array<{ title: DictKey; items: Array<[DictKey, string]> }> = [
  {
    title: 'shortcuts.group.playback',
    items: [
      ['shortcuts.play', 'Space'],
      ['shortcuts.jkl', 'J / K / L'],
      ['shortcuts.frameStep', '← / →'],
      ['shortcuts.secStep', 'Shift + ← / →'],
      ['shortcuts.homeEnd', 'Home / End'],
    ],
  },
  {
    title: 'shortcuts.group.edit',
    items: [
      ['shortcuts.split', 'S'],
      ['shortcuts.duplicate', 'Alt + Sürükle / Ctrl+D'],
      ['shortcuts.delete', 'Del'],
      ['shortcuts.undoRedo', 'Ctrl+Z / Ctrl+Shift+Z'],
      ['shortcuts.marker', 'M'],
      ['shortcuts.text', 'T'],
      ['shortcuts.escape', 'Esc'],
    ],
  },
  {
    title: 'shortcuts.group.timeline',
    items: [
      ['shortcuts.zoom', '+ / −'],
      ['shortcuts.wheelZoom', 'Alt + Tekerlek'],
      ['shortcuts.hScroll', 'Shift + Tekerlek'],
      ['shortcuts.vScroll', 'Tekerlek'],
      ['shortcuts.razor', 'Uç aracı'],
    ],
  },
  {
    title: 'shortcuts.group.other',
    items: [
      ['shortcuts.help', '?'],
      ['shortcuts.dblReset', 'Çift tık (slider)'],
      ['shortcuts.dblBox', 'Çift tık (önizleme çerçevesi)'],
    ],
  },
];

export function ShortcutsDialog() {
  const t = useT();
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen);
  return (
    <div className="dialog-overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) setShortcutsOpen(false); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={t('topbar.shortcuts')}>
        <div className="dialog-title-row">
          <span className="dialog-title">{t('topbar.shortcuts')}</span>
          <button className="icon-btn" onClick={() => setShortcutsOpen(false)} aria-label={t('settings.cancel')}>
            <X size={15} />
          </button>
        </div>
        {GROUPS.map((g) => (
          <div key={g.title} className="insp-section" style={{ gap: 6 }}>
            <div className="insp-section-title">{t(g.title)}</div>
            {g.items.map(([key, combo]) => (
              <div key={key} className="sc-row">
                <span>{t(key)}</span>
                <kbd>{combo}</kbd>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
