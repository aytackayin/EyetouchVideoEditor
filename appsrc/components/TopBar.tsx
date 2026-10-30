import { Redo2, FileOutput, FilePlus2, FolderOpen, Keyboard, Save, Settings, Undo2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type { BundledAssetMeta, ProjectDoc } from '../types';
import { useProjectStore } from '../state/projectStore';
import { useMediaStore } from '../state/mediaStore';
import { useUiStore } from '../state/uiStore';
import { useT } from '../i18n';
import { loadFileBlob } from '../media/storage';
import { buildProjectBundle, isZip, readProjectBundle } from '../media/projectBundle';
import { Logo } from './Logo';

export function TopBar() {
  const t = useT();
  const name = useProjectStore((s) => s.settings.name);
  const setSettings = useProjectStore((s) => s.setSettings);
  const clips = useProjectStore((s) => s.clips);
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const loadDocument = useProjectStore((s) => s.loadDocument);
  const newDocument = useProjectStore((s) => s.newDocument);
  const selectClip = useUiStore((s) => s.selectClip);
  const openConfirm = useUiStore((s) => s.openConfirm);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const setExportOpen = useUiStore((s) => s.setExportOpen);
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen);
  const openInputRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 5000);
  };

  /**
   * Projeyi TEK DOSYA olarak kaydeder: .evproj bir ZIP paketidir — belge +
   * kliplerin kullandığı tüm medyanın orijinal baytları. Orijinal dosyalar
   * diskten silinse bile proje bu dosyadan tam geri yüklenir.
   */
  const saveProject = async () => {
    setBusy(true);
    try {
      const s = useProjectStore.getState();
      const m = useMediaStore.getState();
      const doc: ProjectDoc = {
        settings: s.settings,
        tracks: s.tracks,
        clips: s.clips,
        markers: s.markers,
        currentTime: s.currentTime,
        updatedAt: Date.now(),
      };
      // Yalnız kliplerde kullanılan medya gömülür (maske videoları dahil;
      // kutudaki kullanılmayanlar şişirmesin)
      const usedIds = [
        ...new Set(
          s.clips.flatMap((c) => {
            const ids: string[] = [];
            if (c.assetId) ids.push(c.assetId);
            if (c.mask.enabled && c.mask.shape === 'video' && c.mask.videoAssetId) ids.push(c.mask.videoAssetId);
            return ids;
          }),
        ),
      ];
      const media: Array<{ meta: BundledAssetMeta; blob: Blob }> = [];
      const metas: BundledAssetMeta[] = [];
      for (const id of usedIds) {
        const asset = m.assets.find((a) => a.id === id);
        if (!asset) continue;
        const blob = await loadFileBlob(id);
        if (!blob) continue;
        const fileName = asset.name.replace(/[^\w\-. ]+/g, '_') || 'media';
        const meta: BundledAssetMeta = {
          id,
          name: asset.name,
          fileName,
          mimeType: asset.mimeType,
          sizeBytes: blob.size,
          kind: asset.kind,
          duration: asset.duration,
          width: asset.width,
          height: asset.height,
          hasAudio: asset.hasAudio,
          createdAt: asset.createdAt,
        };
        media.push({ meta, blob });
        metas.push(meta);
      }
      doc.assets = metas;
      const bundle = await buildProjectBundle({ doc, media });
      const base = (s.settings.name || 'proje').replace(/[^\w\-. ]+/g, '_');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(bundle);
      a.download = `${base}.evproj`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 8000);
      showToast(medosToast(metas.length));
    } finally {
      setBusy(false);
    }
  };

  const medosToast = (n: number) =>
    n > 0 ? t('topbar.projectSavedMedia').replace('{n}', String(n)) : t('topbar.projectSaved');

  const openProject = async (file: File) => {
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (isZip(bytes)) {
        // Paketli proje: medyayı geri yükle, sonra belgeyi uygula
        const { doc, assets } = readProjectBundle(bytes);
        await useMediaStore.getState().clearAll();
        await useMediaStore.getState().restoreBundleAssets(assets);
        loadDocument(doc);
        selectClip(null);
        showToast(t('topbar.projectOpenedMedia').replace('{n}', String(assets.length)));
        return;
      }
      const text = new TextDecoder().decode(bytes);
      const doc = JSON.parse(text) as ProjectDoc;
      if (!doc.tracks || !doc.clips) throw new Error('geçersiz');
      const missing = loadDocument(doc);
      selectClip(null);
      if (missing.length > 0) {
        showToast(t('topbar.missingMedia').replace('{n}', String(missing.length)));
      } else {
        showToast(t('topbar.projectOpened'));
      }
    } catch {
      showToast(t('topbar.projectOpenFailed'));
    } finally {
      setBusy(false);
    }
  };

  const onNew = () => {
    const doNew = () => {
      void useMediaStore.getState().clearAll();
      newDocument();
      selectClip(null);
    };
    if (clips.length === 0) {
      doNew();
      return;
    }
    openConfirm({
      title: t('topbar.newProject'),
      message: t('topbar.confirmNew'),
      okLabel: t('topbar.newProject'),
      danger: true,
      onOk: doNew,
    });
  };

  return (
    <header className="topbar">
      <Logo />
      <div className="topbar-sep" />
      <input
        className="project-name"
        value={name}
        placeholder={t('topbar.untitled')}
        spellCheck={false}
        onChange={(e) => setSettings({ name: e.target.value })}
      />
      <button className="icon-btn" disabled={!canUndo} title={t('topbar.undo')} aria-label={t('topbar.undo')} onClick={undo}>
        <Undo2 size={16} />
      </button>
      <button className="icon-btn" disabled={!canRedo} title={t('topbar.redo')} aria-label={t('topbar.redo')} onClick={redo}>
        <Redo2 size={16} />
      </button>
      <div className="topbar-sep" />
      <button className="icon-btn" title={t('topbar.newProject')} onClick={onNew}>
        <FilePlus2 size={15} />
      </button>
      <button className="icon-btn" title={t('topbar.openProject')} onClick={() => openInputRef.current?.click()}>
        <FolderOpen size={15} />
      </button>
      <input
        ref={openInputRef}
        type="file"
        accept=".evproj,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void openProject(f);
          e.target.value = '';
        }}
      />
      <button className="icon-btn" title={t('topbar.saveProject')} onClick={() => void saveProject()} disabled={busy}>
        <Save size={15} />
      </button>
      <div className="spacer" />
      <button className="icon-btn" title={t('topbar.shortcuts')} onClick={() => setShortcutsOpen(true)}>
        <Keyboard size={16} />
      </button>
      <button className="btn accent" title={t('topbar.export')} onClick={() => setExportOpen(true)}>
        <FileOutput size={15} />
        {t('topbar.export')}
      </button>
      <button
        className="icon-btn"
        title={t('topbar.settings')}
        aria-label={t('topbar.settings')}
        onClick={() => setSettingsOpen(true)}
      >
        <Settings size={16} />
      </button>
      {toast && <div className="topbar-toast">{toast}</div>}
    </header>
  );
}
