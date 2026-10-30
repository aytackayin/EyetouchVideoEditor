import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useUiStore } from '../state/uiStore';
import { useT } from '../i18n';

/**
 * Ortak UI kontrolleri: anahtar (switch), özel açılır liste (select),
 * onay penceresi ve sağ tık menüsü. Tarayıcı varsayılanları yerine
 * uygulamanın kendi görsel dilini kullanırlar.
 */

/** Açma/kapama anahtarı — checkbox yerine. */
export function Switch({ checked, onChange, title }: { checked: boolean; onChange: (v: boolean) => void; title?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      className={`switch ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob" />
    </button>
  );
}

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  style?: React.CSSProperties;
  hint?: string;
}

/**
 * Özel açılır liste: yerel <select> yerine. Açılan liste uygulama
 * temasıyla çizilir; dışarı tıklayınca veya Esc ile kapanır.
 */
export function Select<T extends string | number>({
  value,
  options,
  onChange,
  slim,
  ariaLabel,
}: {
  value: T;
  options: SelectOption<T>[];
  onChange: (v: T) => void;
  slim?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Tab') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    window.addEventListener('keydown', onKey);
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) setUp(rect.bottom + 240 > window.innerHeight && rect.top > 260);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`ev-select ${slim ? 'slim' : ''} ${open ? 'open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="ev-select-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="ev-select-value" style={current?.style}>
          {current?.label ?? ''}
        </span>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div className={`ev-select-list ${up ? 'up' : ''}`} role="listbox">
          {options.map((o) => (
            <button
              key={String(o.value)}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={`ev-select-opt ${o.value === value ? 'active' : ''}`}
              style={o.style}
              title={o.hint}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              <span className="ev-select-opt-label">{o.label}</span>
              {o.value === value && <Check size={12} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Onay penceresi — window.confirm yerine. */
export function ConfirmDialog() {
  const t = useT();
  const confirmDlg = useUiStore((s) => s.confirmDlg);
  const closeConfirm = useUiStore((s) => s.closeConfirm);
  if (!confirmDlg) return null;
  return (
    <div
      className="dialog-overlay"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) closeConfirm();
      }}
    >
      <div className="dialog confirm-dialog" role="alertdialog" aria-modal="true">
        <div className="dialog-title">{confirmDlg.title}</div>
        <div className="confirm-message">{confirmDlg.message}</div>
        <div className="dialog-actions">
          <button className="btn" onClick={closeConfirm}>
            {t('confirm.cancel')}
          </button>
          <button
            className={`btn ${confirmDlg.danger ? 'danger' : 'accent'}`}
            onClick={() => {
              closeConfirm();
              confirmDlg.onOk();
            }}
          >
            {confirmDlg.okLabel ?? t('confirm.ok')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Sağ tık menüsü — uiStore'daki duruma göre çizilir. */
export function ContextMenu() {
  const ctxMenu = useUiStore((s) => s.ctxMenu);
  const closeCtxMenu = useUiStore((s) => s.closeCtxMenu);

  useEffect(() => {
    if (!ctxMenu) return;
    // Menü dışına tıklanınca kapat; menü öğesinin kendi tıklamasına karışma
    const close = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t && typeof t.closest === 'function' && t.closest('.ctx-menu')) return;
      closeCtxMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCtxMenu();
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [ctxMenu, closeCtxMenu]);

  if (!ctxMenu) return null;

  const W = 230;
  const estH = ctxMenu.items.reduce((n, it) => n + (it.sep ? 7 : 28), 0) + 8;
  const x = Math.min(ctxMenu.x, window.innerWidth - W - 8);
  const y = Math.min(ctxMenu.y, window.innerHeight - estH - 8);

  return (
    <div className="ctx-menu" style={{ left: x, top: y }} onContextMenu={(e) => e.preventDefault()}>
      {ctxMenu.items.map((it, i) =>
        it.sep ? (
          <div key={i} className="ctx-sep" />
        ) : (
          <button
            key={i}
            type="button"
            className={`ctx-item ${it.danger ? 'danger' : ''}`}
            disabled={it.disabled}
            onClick={() => {
              closeCtxMenu();
              it.onClick?.();
            }}
          >
            {it.label}
          </button>
        ),
      )}
    </div>
  );
}
