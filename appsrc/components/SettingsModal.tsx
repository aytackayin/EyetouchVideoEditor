import { X } from 'lucide-react';
import { useState } from 'react';
import { useUiStore, type Theme } from '../state/uiStore';
import { useT, type Lang } from '../i18n';
import { Select } from './controls';
import { Logo } from './Logo';
import {
  APP_VERSION,
  fetchLatestVersion,
  isNewer,
  openReleasesPage,
  triggerUpdate,
} from '../update';

const GITHUB_USER = 'https://github.com/aytackayin';

/**
 * Hakkında sekmesi: sürüm + GERÇEK güncelleme denetimi.
 * Tepsi EXE'si varsa güncelleme onun üzerinden uygulanır; yoksa releases sayfası.
 */
function AboutPane() {
  const t = useT();
  const [durum, setDurum] = useState<'idle' | 'kontrol' | 'guncel' | 'yeni' | 'uygulaniyor' | 'hata'>('idle');
  const [sonSurum, setSonSurum] = useState('');

  const denetle = async () => {
    setDurum('kontrol');
    const v = await fetchLatestVersion();
    if (!v) {
      setDurum('hata');
      return;
    }
    setSonSurum(v);
    setDurum(isNewer(v, APP_VERSION) ? 'yeni' : 'guncel');
  };

  const guncelle = async () => {
    setDurum('uygulaniyor');
    const ok = await triggerUpdate();
    if (!ok) {
      openReleasesPage();
      setDurum('hata');
    }
    // EXE akışı: indir → kur → sunucu yeniden başlar; sayfa 35 sn sonra yenilenir
    setTimeout(() => window.location.reload(), 35000);
  };

  return (
    <div className="about-pane">
      <Logo />
      <div className="about-version">{t('settings.aboutVersion')} {APP_VERSION}</div>
      <p className="about-text">{t('settings.aboutText')}</p>
      <div className="about-row">
        <span className="about-github-label">{t('settings.aboutGithub')}</span>
        <a className="about-link" href="https://github.com/aytackayin" target="_blank" rel="noreferrer">
          github.com/aytackayin
        </a>
      </div>
      <div className="about-row">
        {durum !== 'uygulaniyor' ? (
          <button className="btn slim" disabled={durum === 'kontrol'} onClick={() => void denetle()}>
            {t('settings.updateCheck')}
          </button>
        ) : (
          <span className="insp-note">{t('update.updating')}</span>
        )}
        {durum === 'guncel' && <span className="about-version">✓ {t('update.latest').replace('{v}', APP_VERSION)}</span>}
        {durum === 'yeni' && (
          <button className="btn slim accent" onClick={() => void guncelle()}>
            {t('update.available').replace('{v}', sonSurum)} — {t('update.install')}
          </button>
        )}
        {durum === 'hata' && <span className="insp-note">{t('update.failed')}</span>}
      </div>
    </div>
  );
}

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

        {tab === 'about' && <AboutPane />}

        <div className="dialog-actions">
          <button className="btn accent" onClick={() => setSettingsOpen(false)}>
            {t('settings.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
