/**
 * Otomatik güncelleme zinciri:
 * 1) GitHub API'den son release sürümünü al (vX.Y.Z → X.Y.Z)
 * 2) APP_VERSION ile karşılaştır
 * 3) Tetikleme: tepsi EXE'sinin /eyetouch/update ucu (EXE zip indirir, dosyaları
 *    ve kendi exe'sini günceller, sunucuyu yeniden başlatır). EXE yoksa
 *    (ör. vite dev) releases sayfası açılır.
 */
export const APP_VERSION = '1.1.0';
const REPO_LATEST = 'https://api.github.com/repos/aytackayin/EyetouchVideoEditor/releases/latest';
const RELEASES_PAGE = 'https://github.com/aytackayin/EyetouchVideoEditor/releases';

/** Son yayınlanan sürüm ('1.2.3'); alınamazsa null. */
export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch(REPO_LATEST, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { tag_name?: unknown };
    if (typeof data.tag_name !== 'string') return null;
    return data.tag_name.replace(/^v/i, '').trim();
  } catch {
    return null;
  }
}

/** remote, local'den büyük mü? (yalnız sayısal noktalı sürümler) */
export function isNewer(remote: string, local: string): boolean {
  const p = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0);
  const a = p(remote);
  const b = p(local);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** Tepsi EXE'si üzerinden güncellemeyi tetikle; EXE yoksa false. */
export async function triggerUpdate(): Promise<boolean> {
  try {
    const res = await fetch('/eyetouch/update', { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}

/** Tepsi EXE'si bu uygulamayı sunuyor mu? */
export async function hasTray(): Promise<boolean> {
  try {
    const res = await fetch('/eyetouch/ping');
    return res.ok;
  } catch {
    return false;
  }
}

export function openReleasesPage(): void {
  window.open(RELEASES_PAGE, '_blank', 'noreferrer');
}
