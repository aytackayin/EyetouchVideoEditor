import { useRef, useState } from 'react';
import { Film, Image as ImageIcon, Music, Plus, Trash2 } from 'lucide-react';
import type { MediaAsset } from '../types';
import { useMediaStore } from '../state/mediaStore';
import { useProjectStore } from '../state/projectStore';
import { useUiStore } from '../state/uiStore';
import { useT } from '../i18n';
import { durationLabel } from '../utils';

const KIND_ICONS = { video: Film, audio: Music, image: ImageIcon } as const;

function AssetCard({ asset }: { asset: MediaAsset }) {
  const t = useT();
  const removeAsset = useMediaStore((s) => s.removeAsset);
  const addClipFromAsset = useProjectStore((s) => s.addClipFromAsset);
  const selectClip = useUiStore((s) => s.selectClip);
  const KindIcon = KIND_ICONS[asset.kind];
  return (
    <div
      className="media-card"
      title={`${asset.name} — ${t('media.bin.hint')}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-ev-asset', asset.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onDoubleClick={() => {
        const id = addClipFromAsset(asset.id);
        if (id) selectClip(id);
      }}
    >
      <div className="media-thumb">
        {asset.thumbUrl ? (
          <img src={asset.thumbUrl} alt="" loading="lazy" />
        ) : (
          <KindIcon size={26} />
        )}
        <span className="media-kind-icon" title={t(`media.kind.${asset.kind}`)}>
          <KindIcon size={12} />
        </span>
        {asset.duration > 0 && (
          <span className="media-duration">{durationLabel(asset.duration)}</span>
        )}
        <button
          className="media-remove"
          title={t('media.remove')}
          aria-label={`${t('media.remove')}: ${asset.name}`}
          onClick={() => removeAsset(asset.id)}
        >
          <Trash2 size={13} />
        </button>
      </div>
      <div className="media-name">{asset.name}</div>
    </div>
  );
}

export function MediaBin() {
  const t = useT();
  const assets = useMediaStore((s) => s.assets);
  const importing = useMediaStore((s) => s.importing);
  const importErrors = useMediaStore((s) => s.importErrors);
  const addFiles = useMediaStore((s) => s.addFiles);
  const clearImportErrors = useMediaStore((s) => s.clearImportErrors);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragCount, setDragCount] = useState(0);

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

  const onPick = () => inputRef.current?.click();

  const onFilesChosen = (files: FileList | null) => {
    if (files && files.length > 0) addFiles(Array.from(files));
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <section className="panel" aria-label={t('media.title')}>
      <div className="panel-header">
        <span className="panel-title">{t('media.title')}</span>
        <div className="spacer" />
        <button className="btn" onClick={onPick} disabled={importing}>
          <Plus size={15} />
          {importing ? t('media.importing') : t('media.import')}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="video/*,audio/*,image/*"
          hidden
          onChange={(e) => onFilesChosen(e.target.files)}
        />
      </div>
      <div
        className={`panel-body media-drop${dragCount > 0 ? ' dragover' : ''}`}
        onDragOver={(e) => {
          if (hasFiles(e)) e.preventDefault();
        }}
        onDragEnter={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          setDragCount((c) => c + 1);
        }}
        onDragLeave={(e) => {
          if (!hasFiles(e)) return;
          setDragCount((c) => Math.max(0, c - 1));
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragCount(0);
          if (e.dataTransfer.files.length > 0) addFiles(Array.from(e.dataTransfer.files));
        }}
      >
        {importing && <div className="media-note">{t('media.importing')}</div>}
        {importErrors.length > 0 && (
          <div className="media-note error" onClick={clearImportErrors}>
            {t('media.import.failed')} {importErrors.join(', ')}
          </div>
        )}
        {assets.length === 0 && !importing ? (
          <div className="media-empty">
            <span className="media-empty-title">{t('media.empty.title')}</span>
            <span className="media-empty-hint">{t('media.empty.hint')}</span>
          </div>
        ) : (
          assets.map((a) => <AssetCard key={a.id} asset={a} />)
        )}
      </div>
    </section>
  );
}
