import { useUiStore } from '../state/uiStore';
import { tr } from './tr';
import { en } from './en';

export type Lang = 'tr' | 'en';
export type DictKey = keyof typeof tr;

const dicts = { tr, en } as const;

/**
 * Zustand üzerinden dili okur; tip güvenli çeviri fonksiyonu döndürür.
 * Kullanım: const t = useT(); t('media.title')
 */
export function useT() {
  const lang = useUiStore((s) => s.lang);
  return (key: DictKey): string => dicts[lang][key] ?? tr[key] ?? key;
}

/** React bileşenleri dışında (store action vb.) kullanım */
export function tSync(key: DictKey): string {
  const lang = useUiStore.getState().lang;
  return dicts[lang][key] ?? tr[key] ?? key;
}
