import { X } from 'lucide-react';
import { useState } from 'react';
import { useUiStore, type Theme } from '../state/uiStore';
import { useT, type Lang } from '../i18n';
import { Select } from './controls';
import { Logo } from './Logo';

const APP_VERSION = '1.0.0';
const GITHUB_USER = 'https://github.com/aytackayin';
const GITHUB_RELEASES = 'https://github.com/aytackayin/EyetouchVideoEditor/releases';

/**
 * Ayarlar penceresi — "Genel" (dil, tema) ve "Hakkında" sekmeleri.
 * Proje ayarları (ad/çözünürlük/fps) Denetçi panelindedir.
 */
export function SettingsModal() {
  const t = useT();
  const lang = useUiStore((s) => s.lang);
  const setLang = useUiStore((s) => s.setLang);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const [tab, setTab] = useState<'general' | 'about'>('general');

  const themeOptions: Array<{ value: Theme; label: string }> = [
    { value: 'light', label: t('settings.theme.light') },
    { value: 'dark', label: t('settings.theme.dark') },
    { value: 'system', label: t('settings.theme.system') },
  ];

  return (
    <div className="dialog-overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) setSettingsOpen(false); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={t('settings.title')}>
        <div className="dialog-title-row">
          <span className="dialog-title">{t('settings.title')}</span>
          <button className="icon-btn" onClick={() => setSettingsOpen(false)} aria-label={t('settings.close')}>
            <X size={15} />
          </button>
        </div>
        <div className="inspector-tabs">
          <button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}>
            {t('settings.tab.general')}
          </button>
          <button className={tab === 'about' ? 'active' : ''} onClick={() => setTab('about')}>
            {t('settings.tab.about')}
          </button>
        </div>

        {tab === 'general' && (
          <div className="field">
            <label>{t('settings.language')}</label>
            <Select
              value={lang}
              options={[
                { value: 'tr' as Lang, label: 'Türkçe' },
                { value: 'en' as Lang, label: 'English' },
              ]}
              onChange={(l) => setLang(l)}
            />
            <label style={{ marginTop: 8 }}>{t('settings.theme')}</label>
            <div className="segment theme-segment">
              {themeOptions.map((o) => (
                <button key={o.value} className={theme === o.value ? 'active' : ''} onClick={() => setTheme(o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'about' && (
          <div className="about-pane">
            <Logo />
            <div className="about-version">{t('settings.aboutVersion')} {APP_VERSION}</div>
            <p className="about-text">{t('settings.aboutText')}</p>
            <div className="about-row">
              <span className="about-github-label">{t('settings.aboutGithub')}</span>
              <a className="about-link" href={GITHUB_USER} target="_blank" rel="noreferrer">
                github.com/aytackayin
              </a>
            </div>
            <div className="about-row">
              <button
                className="btn slim"
                onClick={() => window.open(GITHUB_RELEASES, '_blank', 'noreferrer')}
              >
                {t('settings.updateCheck')}
              </button>
            </div>
          </div>
        )}

        <div className="dialog-actions">
          <button className="btn accent" onClick={() => setSettingsOpen(false)}>
            {t('settings.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
