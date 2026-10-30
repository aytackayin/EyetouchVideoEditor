/**
 * Uygulama stilleri — CSS dosyaları ortamdaki bir koruma katmanı tarafından
 * ~3KB üstünde silindiği için tüm stiller TS içinde taşınır ve main.tsx
 * içinde <style> etiketiyle enjekte edilir.
 */
export const appStyles = `
/* --- Tema değişkenleri + reset --- */
:root {
  --bg-app: #0b0c0f;
  --bg-panel: #14161a;
  --bg-panel-2: #191c21;
  --bg-elevated: #1f232a;
  --bg-input: #0e1013;
  --bg-hover: #23272f;
  --bg-active: #2a2f38;
  --border: #262a31;
  --border-strong: #343a44;
  --text-1: #e6e8ec;
  --text-2: #9aa0ab;
  --text-3: #646b76;
  --accent: #4c7ff0;
  --accent-hover: #6395f5;
  --accent-soft: rgba(76, 127, 240, 0.16);
  --danger: #e5484d;
  --success: #46a758;
  --warning: #f5a524;
  --radius: 6px;
  --radius-sm: 4px;
  --h-topbar: 44px;
  --overlay: rgba(5, 6, 8, 0.62);
  --scrollbar-thumb: #2c313a;
  --scrollbar-thumb-hover: #3a414d;
  --slider-track: #2c313a;
  --ruler-bg: #14161a;
  --ruler-tick: #3a414d;
  --ruler-label: #8b919c;
  --clip-name-bg: rgba(8, 10, 14, 0.68);
  --font-ui: -apple-system, 'Segoe UI', system-ui, Roboto, 'Helvetica Neue', Arial, sans-serif;
  --font-mono: 'Cascadia Mono', 'SF Mono', 'JetBrains Mono', Consolas, monospace;
}
[data-theme='light'] {
  --bg-app: #eef0f3;
  --bg-panel: #ffffff;
  --bg-panel-2: #f6f7f9;
  --bg-elevated: #eceef2;
  --bg-input: #ffffff;
  --bg-hover: #e7eaef;
  --bg-active: #dce1e8;
  --border: #d9dde3;
  --border-strong: #bfc6cf;
  --text-1: #1b1f26;
  --text-2: #525a66;
  --text-3: #868e9b;
  --accent: #3565d8;
  --accent-hover: #4a77e0;
  --accent-soft: rgba(53, 101, 216, 0.12);
  --overlay: rgba(20, 24, 30, 0.35);
  --scrollbar-thumb: #c3c9d2;
  --scrollbar-thumb-hover: #aeb5c0;
  --slider-track: #d5dae1;
  --ruler-bg: #f6f7f9;
  --ruler-tick: #bfc6cf;
  --ruler-label: #525a66;
  --clip-name-bg: rgba(255, 255, 255, 0.75);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #root { height: 100%; overflow: hidden; }
body { background: var(--bg-app); color: var(--text-1); font-family: var(--font-ui); font-size: 13px; line-height: 1.45; -webkit-font-smoothing: antialiased; user-select: none; }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 5px; border: 2px solid var(--bg-panel); }
::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-thumb-hover); }
::-webkit-scrollbar-corner { background: transparent; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: -1px; }
button { font-family: inherit; font-size: inherit; color: inherit; background: none; border: none; cursor: default; }
button:disabled { cursor: default; }
input, select { font-family: inherit; font-size: inherit; color: var(--text-1); }
svg { display: block; flex-shrink: 0; }

/* --- Yerleşim --- */
.app { display: grid; grid-template-rows: var(--h-topbar) minmax(0, 1fr) auto; height: 100vh; background: var(--bg-app); }
.main { display: grid; grid-template-columns: var(--media-w, 272px) 5px minmax(0, 1fr) 312px; min-height: 0; }
.media-divider { cursor: ew-resize; background: var(--bg-app); border-left: 1px solid var(--border); border-right: 1px solid var(--border); }
.media-divider:hover, .media-divider.dragging { background: var(--accent); }
.panel { display: flex; flex-direction: column; min-height: 0; min-width: 0; background: var(--bg-panel); }
.panel + .panel { border-left: 1px solid var(--border); }
.panel-header { display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 10px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.panel-title { font-size: 11px; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase; color: var(--text-2); }
.panel-header .spacer { flex: 1; }
.panel-body { flex: 1; min-height: 0; overflow-y: auto; position: relative; }
.timeline-divider { height: 5px; cursor: ns-resize; background: var(--bg-app); border-top: 1px solid var(--border); position: relative; z-index: 5; }
.timeline-divider:hover, .timeline-divider.dragging { background: var(--accent); }
.splash { height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; background: var(--bg-app); }
.splash-spinner { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--border-strong); border-top-color: var(--accent); animation: splash-spin 0.8s linear infinite; }
@keyframes splash-spin { to { transform: rotate(360deg); } }

/* --- Logo / üst bar --- */
.logo { display: flex; align-items: center; gap: 9px; }
.logo-mark { color: var(--accent); }
.logo-text { display: flex; flex-direction: column; line-height: 1.1; }
.logo-name { font-size: 12px; font-weight: 700; letter-spacing: 1.6px; }
.logo-sub { font-size: 9px; font-weight: 500; letter-spacing: 2.2px; color: var(--text-3); text-transform: uppercase; }
.topbar { display: flex; align-items: center; gap: 10px; padding: 0 12px; background: var(--bg-panel); border-bottom: 1px solid var(--border); }
.topbar .spacer, .transport .spacer { flex: 1; }
.topbar-sep { width: 1px; height: 20px; background: var(--border); margin: 0 2px; flex-shrink: 0; }
.topbar-stats { font-size: 10.5px; font-family: var(--font-mono); color: var(--text-3); white-space: nowrap; }
.topbar-toast { position: absolute; top: 48px; left: 50%; transform: translateX(-50%); background: var(--bg-elevated); border: 1px solid var(--border-strong); border-radius: var(--radius); padding: 7px 12px; font-size: 12px; color: var(--text-1); box-shadow: 0 8px 24px rgba(0,0,0,.4); z-index: 200; max-width: 480px; }
.project-name { border: 1px solid transparent; border-radius: var(--radius-sm); padding: 3px 8px; font-size: 13px; font-weight: 500; color: var(--text-1); background: transparent; min-width: 110px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.project-name:hover { background: var(--bg-hover); border-color: var(--border); }
.project-name:focus { outline: none; background: var(--bg-input); border-color: var(--accent); }

/* --- Düğmeler --- */
.btn { display: inline-flex; align-items: center; gap: 6px; height: 27px; padding: 0 10px; border-radius: var(--radius-sm); font-size: 12px; font-weight: 500; color: var(--text-1); transition: background 0.1s, color 0.1s; white-space: nowrap; }
.btn:hover:not(:disabled) { background: var(--bg-hover); }
.btn:disabled { color: var(--text-3); opacity: 0.7; }
.btn.accent { background: var(--accent); color: #fff; font-weight: 600; }
.btn.accent:hover:not(:disabled) { background: var(--accent-hover); }
.btn.accent:disabled { background: var(--bg-elevated); color: var(--text-3); opacity: 1; }
.btn.accent-soft { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.btn.accent-soft:hover { background: rgba(76, 127, 240, 0.26); }
.btn.slim { height: 22px; padding: 0 7px; font-size: 11px; }
.icon-btn { display: inline-flex; align-items: center; justify-content: center; gap: 1px; min-width: 27px; height: 27px; padding: 0 3px; border-radius: var(--radius-sm); color: var(--text-2); transition: background 0.1s, color 0.1s; }
.icon-btn:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-1); }
.icon-btn:disabled { color: var(--text-3); opacity: 0.55; }
.icon-btn.active { background: var(--accent-soft); color: var(--accent); }
.icon-btn.primary { background: var(--bg-elevated); color: var(--text-1); }
.icon-btn.primary:hover { background: var(--accent); color: #fff; }
.icon-btn.mini { min-width: 20px; height: 20px; }
.icon-btn.wide { width: auto; }
.segment { display: inline-flex; border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; height: 27px; }
.segment button { padding: 0 10px; font-size: 11px; font-weight: 600; letter-spacing: 0.5px; color: var(--text-3); transition: background 0.1s, color 0.1s; }
.segment button:hover { color: var(--text-1); }
.segment button.active { background: var(--accent-soft); color: var(--accent); }

/* --- Girişler --- */
.field { display: flex; flex-direction: column; gap: 6px; }
.field label { font-size: 11px; font-weight: 500; color: var(--text-2); letter-spacing: 0.3px; }
.input, .select { height: 30px; padding: 0 9px; background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-1); font-size: 12.5px; width: 100%; }
.input:hover, .select:hover { border-color: var(--border-strong); }
.input:focus, .select:focus { outline: none; border-color: var(--accent); }
.input.area { height: auto; padding: 7px 9px; resize: vertical; font-family: inherit; line-height: 1.4; }
.select.slim { height: 26px; width: 130px; }
.select { appearance: none; padding-right: 26px; }
.dim-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
input[type='checkbox'] { accent-color: var(--accent); width: 14px; height: 14px; }
input[type='color'] { width: 34px; height: 24px; padding: 1px 2px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); background: var(--bg-input); cursor: pointer; }
.color-none { display: flex; align-items: center; gap: 8px; }

/* --- Kaydırıcı --- */
.slider { -webkit-appearance: none; appearance: none; flex: 1; height: 4px; border-radius: 2px; background: var(--slider-track); outline: none; min-width: 56px; cursor: pointer; }
.slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 13px; height: 13px; border-radius: 50%; background: var(--accent); border: 2px solid #0b0c0f; box-shadow: 0 0 0 1px var(--border-strong); cursor: pointer; }
.slider::-webkit-slider-thumb:hover { background: var(--accent-hover); }
.slider.mini { width: 80px; flex: none; }

/* --- Pencere --- */
.dialog-overlay { position: fixed; inset: 0; background: var(--overlay); display: flex; align-items: center; justify-content: center; z-index: 100; }
.dialog { width: 420px; max-width: calc(100vw - 48px); max-height: calc(100vh - 64px); overflow-y: auto; background: var(--bg-panel-2); border: 1px solid var(--border-strong); border-radius: 10px; box-shadow: 0 18px 48px rgba(0, 0, 0, 0.5); padding: 18px; display: flex; flex-direction: column; gap: 14px; }
.dialog.export-dialog { width: 480px; }
.dialog-title { font-size: 14px; font-weight: 600; }
.dialog-title-row { display: flex; align-items: center; justify-content: space-between; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.dialog-error { font-size: 12px; color: var(--danger); min-height: 16px; }

/* --- Medya kutusu --- */
.media-drop { padding: 10px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; align-content: start; min-height: 100%; }
.media-drop.dragover { outline: 2px dashed var(--accent); outline-offset: -6px; background: var(--accent-soft); }
.media-empty { grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 40px 16px; margin: 10px; border: 1.5px dashed var(--border-strong); border-radius: var(--radius); color: var(--text-3); text-align: center; }
.media-empty-title { font-size: 12.5px; font-weight: 600; color: var(--text-2); }
.media-empty-hint { font-size: 11.5px; line-height: 1.5; max-width: 200px; }
.media-card { position: relative; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg-panel-2); overflow: hidden; transition: border-color 0.1s; cursor: grab; }
.media-card:hover { border-color: var(--accent); }
.media-card:active { cursor: grabbing; }
.media-thumb { aspect-ratio: 16 / 10; background: #07080a; display: flex; align-items: center; justify-content: center; color: var(--text-3); position: relative; }
.media-thumb img { width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
.media-duration { position: absolute; right: 4px; bottom: 4px; padding: 1px 5px; border-radius: 3px; background: rgba(8, 9, 12, 0.82); font-family: var(--font-mono); font-size: 10.5px; color: var(--text-2); }
.media-kind-icon { position: absolute; left: 5px; top: 5px; padding: 3px; border-radius: 3px; background: rgba(8, 9, 12, 0.72); color: var(--text-2); }
.media-name { padding: 5px 7px; font-size: 11.5px; color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.media-remove { position: absolute; right: 3px; top: 3px; width: 22px; height: 22px; border-radius: var(--radius-sm); display: none; align-items: center; justify-content: center; background: rgba(8, 9, 12, 0.82); color: var(--text-2); }
.media-card:hover .media-remove { display: inline-flex; }
.media-remove:hover { color: var(--danger); background: rgba(8, 9, 12, 0.95); }
.media-note { grid-column: 1 / -1; font-size: 11.5px; color: var(--text-2); padding: 2px 2px 0; }
.media-note.error { color: var(--warning); }

/* --- Önizleme --- */
.preview-stage { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; background: linear-gradient(45deg, #101216 25%, transparent 25%), linear-gradient(-45deg, #101216 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #101216 75%), linear-gradient(-45deg, transparent 75%, #101216 75%), #0d0e11; background-size: 22px 22px; background-position: 0 0, 0 11px, 11px -11px, -11px 0; padding: 22px; }
.preview-frame { position: relative; background: #000; border: 1px solid var(--border-strong); border-radius: 3px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45); display: flex; align-items: center; justify-content: center; max-width: 100%; max-height: 100%; }
.preview-frame canvas { display: block; width: 100%; height: 100%; }
.preview-hint { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--text-3); font-size: 12px; letter-spacing: 0.4px; pointer-events: none; }
.preview-meta { font-family: var(--font-mono); font-size: 11px; color: var(--text-3); letter-spacing: 0.3px; }
.preview-meta.clickable { cursor: pointer; padding: 3px 7px; border-radius: var(--radius-sm); }
.preview-meta.clickable:hover { background: var(--bg-hover); color: var(--text-1); }
.transport { display: flex; align-items: center; gap: 4px; padding: 0 10px; height: 40px; border-top: 1px solid var(--border); flex-shrink: 0; }
.transport .time { font-family: var(--font-mono); font-size: 12.5px; color: var(--text-1); letter-spacing: 0.6px; margin-left: 10px; }
.transport .time-total { color: var(--text-3); }
.master-volume { display: flex; align-items: center; gap: 6px; color: var(--text-3); }

/* --- Dönüşüm çerçevesi (önizleme) --- */
.tf-overlay-root { position: absolute; inset: 0; pointer-events: none; z-index: 10; }
.tf-guide-v { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(76, 127, 240, 0.8); z-index: 15; }
.tf-guide-h { position: absolute; left: 0; right: 0; height: 1px; background: rgba(76, 127, 240, 0.8); z-index: 15; }
.tf-box { position: absolute; border: 1.5px solid var(--accent); pointer-events: auto; cursor: move; }
.tf-box.active { border-color: var(--accent-hover); }
.tf-handle { position: absolute; width: 9px; height: 9px; background: #fff; border: 1.5px solid var(--accent); border-radius: 2px; }
/* Köşe dışı döndürme bölgeleri: görünmez — yalnız imleç döndürme ikonu olur */
.tf-rotate-zone { position: absolute; border-radius: 50%; z-index: 2; cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cg fill='none' stroke='%23000' stroke-width='3.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 3v5h5'/%3E%3Cpath d='M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8'/%3E%3C/g%3E%3Cg fill='none' stroke='%23fff' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 3v5h5'/%3E%3Cpath d='M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8'/%3E%3C/g%3E%3C/svg%3E") 12 12, crosshair; }
.cr-handle { position: absolute; z-index: 20; background: var(--bg-elevated); border: 1.5px solid var(--text-3); border-radius: 3px; opacity: 0; transition: opacity 0.1s, border-color 0.1s; }
.preview-frame:hover .cr-handle { opacity: 1; }
.cr-handle:hover { border-color: var(--accent); background: var(--accent); opacity: 1; }
.tf-label { position: absolute; top: -20px; left: 0; font-family: var(--font-mono); font-size: 10px; color: var(--accent); background: rgba(8,9,12,.8); padding: 1px 5px; border-radius: 3px; white-space: nowrap; }

/* --- Denetçi --- */
.inspector-tabs { display: flex; gap: 2px; padding: 8px 10px 0; border-bottom: 1px solid var(--border); }
.inspector-tabs button { flex: 1; height: 26px; border-radius: var(--radius-sm) var(--radius-sm) 0 0; font-size: 11.5px; font-weight: 500; color: var(--text-3); border-bottom: 2px solid transparent; }
.inspector-tabs button:hover:not(:disabled) { color: var(--text-1); }
.inspector-tabs button:disabled { opacity: 0.4; }
.inspector-tabs button.active { color: var(--accent); border-bottom-color: var(--accent); }
.inspector-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-3); font-size: 12px; }
.inspector-body { padding: 12px 12px 20px; }
.insp-clip-name { font-size: 11.5px; color: var(--text-2); max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.insp-section { display: flex; flex-direction: column; gap: 9px; padding-bottom: 12px; margin-bottom: 12px; border-bottom: 1px solid var(--border); }
.insp-section:last-child { border-bottom: none; margin-bottom: 0; }
.insp-section-title { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 600; letter-spacing: 0.6px; text-transform: uppercase; color: var(--text-2); }
.insp-hint { font-size: 9.5px; font-weight: 400; text-transform: none; letter-spacing: 0; color: var(--text-3); margin-right: auto; }
.insp-subtitle { font-size: 10.5px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; color: var(--text-3); margin-top: 4px; padding-top: 8px; border-top: 1px dashed var(--border); }
.insp-row { display: flex; align-items: center; gap: 8px; min-height: 24px; }
.insp-label { width: 86px; flex-shrink: 0; font-size: 11.5px; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.insp-control { flex: 1; display: flex; align-items: center; gap: 6px; }
.insp-value { width: 52px; flex-shrink: 0; text-align: right; font-family: var(--font-mono); font-size: 10.5px; color: var(--text-3); }
.insp-readonly { font-family: var(--font-mono); font-size: 11.5px; color: var(--text-1); }
.insp-note { font-size: 10.5px; color: var(--warning); }
.insp-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.check-row { display: flex; align-items: center; gap: 7px; font-size: 12px !important; color: var(--text-1) !important; cursor: pointer; }
.diamond-btn { color: var(--text-3); }
.diamond-btn.active { color: var(--accent); }

/* Keyframe çipleri */
.kf-row { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.kf-prop { font-family: var(--font-mono); font-size: 10px; color: var(--text-3); width: 52px; }
.kf-chip { min-width: 20px; height: 18px; padding: 0 4px; border-radius: 9px; background: var(--bg-elevated); border: 1px solid var(--border-strong); color: var(--text-2); font-size: 10px; font-family: var(--font-mono); }
.kf-chip:hover { border-color: var(--accent); color: var(--text-1); }
.kf-chip.active { background: var(--accent); border-color: var(--accent); color: #fff; }

/* Kısayol penceresi satırları */
.sc-row { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--text-2); padding: 2px 0; }
.sc-row kbd { font-family: var(--font-mono); font-size: 11px; color: var(--text-1); background: var(--bg-input); border: 1px solid var(--border-strong); border-radius: 4px; padding: 1px 7px; }

/* --- Zaman çizgisi --- */
.panel.timeline { flex-direction: column; }
.tl-body { flex: 1; min-height: 0; display: flex; overflow: hidden; }
.tl-left { flex-shrink: 0; border-right: 1px solid var(--border); background: var(--bg-panel); display: flex; flex-direction: column; overflow: hidden; }
.tl-headers { flex: 1; overflow: hidden; position: relative; }
.tl-header { display: flex; align-items: center; gap: 6px; padding: 0 8px 0 3px; border-bottom: 1px solid var(--border); background: var(--bg-panel-2); }
.tl-grip { display: inline-flex; align-items: center; justify-content: center; width: 16px; flex-shrink: 0; color: var(--text-3); cursor: grab; border-radius: 3px; padding: 3px 0; }
.tl-grip:hover { color: var(--text-1); background: var(--bg-hover); }
.tl-grip:active { cursor: grabbing; }
.tl-reorder-hint { position: absolute; left: 4px; right: 4px; height: 2px; background: var(--accent); box-shadow: 0 0 5px var(--accent); border-radius: 1px; z-index: 6; pointer-events: none; }
.tl-header.audio { background: #15191a; }
.tl-header-name { font-size: 11px; font-weight: 700; font-family: var(--font-mono); color: var(--text-2); width: 26px; flex-shrink: 0; }
.tl-header-actions { display: flex; gap: 2px; margin-left: auto; }
.tl-scroll { flex: 1; overflow: auto; position: relative; }
.tl-inner { position: relative; min-height: 100%; }
.tl-ruler { display: block; position: sticky; top: 0; z-index: 4; cursor: ew-resize; }
.tl-lane { position: relative; border-bottom: 1px solid var(--border); background: repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 100%), var(--bg-panel-2); background-size: 24px 100%; }
.tl-lane.audio { background: repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.014) 0 1px, transparent 1px 100%), #131714; background-size: 24px 100%; }
.tl-drop-hint { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--accent); z-index: 3; pointer-events: none; }
.tl-clip { position: absolute; top: 3px; bottom: 3px; border-radius: 4px; overflow: hidden; cursor: grab; border: 1px solid var(--border-strong); background: #1d2633; user-select: none; }
.tl-clip:active { cursor: grabbing; }
.tl-clip.video { background: linear-gradient(180deg, #213043 0%, #1a2532 100%); border-color: #324a63; }
.tl-clip.audio { background: linear-gradient(180deg, #1b2e22 0%, #152219 100%); border-color: #2f5238; }
.tl-clip.text { background: linear-gradient(180deg, #2e2340 0%, #241b32 100%); border-color: #4c3a68; }
.tl-clip.selected { border-color: var(--accent); box-shadow: 0 0 0 1.5px var(--accent); }
.tl-clip.razor-cursor { cursor: crosshair; }
.tl-clip-name { position: absolute; top: 0; left: 0; right: 0; height: 16px; display: flex; align-items: center; gap: 4px; padding: 0 5px; background: var(--clip-name-bg); font-size: 10px; font-weight: 500; color: #d7dae0; white-space: nowrap; overflow: hidden; z-index: 2; pointer-events: none; }
.tl-mask-badge { color: var(--warning); margin-right: 2px; }
.tl-speed-badge { font-family: var(--font-mono); font-size: 9px; color: var(--warning); background: rgba(0,0,0,.4); padding: 0 3px; border-radius: 2px; }
.tl-filmstrip { position: absolute; inset: 16px 0 0 0; pointer-events: none; opacity: 0.92; }
.tl-thumb-strip { position: absolute; inset: 16px 0 0 0; background-repeat: repeat-x; background-size: auto 100%; opacity: 0.85; pointer-events: none; }
.tl-waveform { position: absolute; inset: 16px 3px 2px 3px; pointer-events: none; }
.tl-text-preview { position: absolute; inset: 18px 5px 2px 5px; display: flex; align-items: center; gap: 5px; color: #cbb8e8; font-size: 10.5px; white-space: nowrap; overflow: hidden; pointer-events: none; }
.tl-transition { position: absolute; top: 0; bottom: 0; left: 0; background: repeating-linear-gradient(135deg, rgba(76, 127, 240, 0.4) 0 4px, rgba(76, 127, 240, 0.12) 4px 8px); border-right: 1px solid var(--accent); z-index: 3; pointer-events: none; }
.tl-fade { position: absolute; bottom: 0; height: 100%; pointer-events: none; z-index: 2; }
.tl-fade-in { left: 0; background: linear-gradient(90deg, rgba(0, 0, 0, 0.6), transparent); }
.tl-fade-out { right: 0; background: linear-gradient(270deg, rgba(0, 0, 0, 0.6), transparent); }
.tl-trim-handle { position: absolute; top: 0; bottom: 0; width: 10px; z-index: 4; cursor: ew-resize; display: flex; align-items: center; justify-content: center; }
.tl-trim-handle.left { left: 0; }
.tl-trim-handle.right { right: 0; }
.tl-trim-handle span { width: 3px; height: 46%; border-radius: 2px; background: rgba(255,255,255,.55); display: none; }
.tl-clip:hover .tl-trim-handle span { display: block; }
.tl-clip.selected .tl-trim-handle span { background: #fff; display: block; }
.tl-playhead { position: absolute; top: 0; bottom: 0; width: 0; z-index: 6; pointer-events: none; }
.tl-playhead-line { width: 1.5px; height: 100%; background: #ff5a5f; margin-left: -0.75px; }
.tl-statusbar { display: flex; gap: 14px; align-items: center; height: 22px; padding: 0 10px; border-top: 1px solid var(--border); font-size: 10.5px; font-family: var(--font-mono); color: var(--text-3); flex-shrink: 0; }

/* --- Dışa aktarma --- */
.container-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.container-grid.codec-grid { grid-template-columns: repeat(4, 1fr); }
.container-chip { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 4px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg-panel); transition: border-color 0.1s, background 0.1s; }
.container-chip:hover:not(:disabled) { border-color: var(--border-strong); }
.container-chip.active { border-color: var(--accent); background: var(--accent-soft); }
.container-chip:disabled { opacity: 0.45; }
.container-chip.small { padding: 5px 4px; }
.chip-name { font-size: 12px; font-weight: 700; color: var(--text-1); }
.container-chip.active .chip-name { color: var(--accent); }
.chip-sub { font-size: 9px; color: var(--text-3); }
.filename-row { display: flex; align-items: center; gap: 8px; }
.filename-ext { font-family: var(--font-mono); font-size: 12px; color: var(--text-3); flex-shrink: 0; }
.export-twin { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.export-summary { font-size: 11px; color: var(--text-3); background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 7px 9px; line-height: 1.5; }
.export-progress { display: flex; flex-direction: column; gap: 12px; padding: 8px 0; }
.progress-bar { height: 8px; border-radius: 4px; background: var(--slider-track); overflow: hidden; }
.progress-fill { height: 100%; border-radius: 4px; background: linear-gradient(90deg, var(--accent), #6395f5); transition: width 0.15s ease; }
.progress-stage { font-size: 12px; color: var(--text-2); text-align: center; }
.empty-hint { display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--text-3); }

/* --- Anahtar (switch) --- */
.switch { position: relative; width: 32px; height: 18px; border-radius: 10px; background: var(--bg-active); border: 1px solid var(--border-strong); flex-shrink: 0; transition: background 0.15s, border-color 0.15s; }
.switch:hover { border-color: var(--accent); }
.switch.on { background: var(--accent); border-color: var(--accent); }
.switch-knob { position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3); transition: transform 0.15s; }
.switch.on .switch-knob { transform: translateX(13px); }

/* --- Özel açılır liste --- */
.ev-select { position: relative; width: 100%; }
.ev-select.slim { width: 138px; }
.ev-select-btn { display: flex; align-items: center; justify-content: space-between; gap: 6px; width: 100%; height: 30px; padding: 0 9px; background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-1); font-size: 12.5px; }
.ev-select.slim .ev-select-btn { height: 26px; font-size: 12px; }
.ev-select-btn:hover { border-color: var(--border-strong); }
.ev-select.open .ev-select-btn { border-color: var(--accent); }
.ev-select-value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ev-select-list { position: absolute; left: 0; right: 0; top: calc(100% + 3px); z-index: 300; max-height: 240px; overflow-y: auto; background: var(--bg-elevated); border: 1px solid var(--border-strong); border-radius: var(--radius); box-shadow: 0 10px 28px rgba(0, 0, 0, 0.4); padding: 4px; }
.ev-select-list.up { top: auto; bottom: calc(100% + 3px); }
.ev-select-opt { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding: 6px 8px; border-radius: var(--radius-sm); font-size: 12.5px; color: var(--text-1); text-align: left; }
.ev-select-opt:hover { background: var(--bg-hover); }
.ev-select-opt.active { color: var(--accent); background: var(--accent-soft); }
.ev-select-opt-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* --- Sağ tık menüsü --- */
.ctx-menu { position: fixed; z-index: 500; min-width: 200px; max-width: 260px; background: var(--bg-elevated); border: 1px solid var(--border-strong); border-radius: var(--radius); box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45); padding: 5px; }
.ctx-item { display: block; width: 100%; padding: 6px 10px; border-radius: var(--radius-sm); font-size: 12.5px; color: var(--text-1); text-align: left; }
.ctx-item:hover:not(:disabled) { background: var(--bg-hover); }
.ctx-item.danger { color: var(--danger); }
.ctx-item.danger:hover:not(:disabled) { background: rgba(229, 72, 77, 0.12); }
.ctx-item:disabled { color: var(--text-3); opacity: 0.6; }
.ctx-sep { height: 1px; background: var(--border); margin: 4px 6px; }

/* --- Onay penceresi --- */
.confirm-dialog { width: 360px; }
.confirm-message { font-size: 12.5px; color: var(--text-2); line-height: 1.5; }
.btn.danger { background: var(--danger); color: #fff; font-weight: 600; }
.btn.danger:hover:not(:disabled) { background: #ef6b6f; }

/* --- Slider manuel değer girişi --- */
.insp-value.editable { cursor: text; text-decoration: underline dotted var(--text-3); text-underline-offset: 3px; }
.insp-value.editable:hover { color: var(--text-1); }
.insp-value-input { width: 58px; flex-shrink: 0; text-align: right; font-family: var(--font-mono); font-size: 10.5px; color: var(--text-1); background: var(--bg-input); border: 1px solid var(--accent); border-radius: var(--radius-sm); padding: 2px 4px; outline: none; }

/* --- Ayarlar: Genel/Hakkında --- */
.theme-segment { height: 30px; width: 100%; }
.theme-segment button { flex: 1; }
.about-pane { display: flex; flex-direction: column; gap: 12px; padding: 8px 2px; }
.about-version { font-family: var(--font-mono); font-size: 11px; color: var(--text-3); }
/* Renk carklari */
.cwheels-row { display: flex; gap: 8px; justify-content: space-between; }
.cwheel { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1; min-width: 0; }
.cwheel-label { font-size: 9.5px; font-weight: 600; letter-spacing: 0.3px; color: var(--text-3); text-transform: uppercase; }
.cwheel-pad { position: relative; width: 92px; height: 92px; border-radius: 50%; border: 1.5px solid var(--border-strong); cursor: crosshair; flex-shrink: 0; background: radial-gradient(circle, #7f7f7f 0%, rgba(127,127,127,0) 72%), conic-gradient(from 90deg, #ff0000 0%, #80ff00 25%, #00ffff 50%, #8000ff 75%, #ff0000 100%); box-shadow: inset 0 0 0 1px rgba(0,0,0,.35); }
.cwheel-dot { position: absolute; width: 12px; height: 12px; margin: -6px 0 0 -6px; border-radius: 50%; background: #fff; border: 2px solid #000; box-shadow: 0 0 3px rgba(0,0,0,.7); pointer-events: none; }
.cwheel-master { width: 84px; }

.about-text { font-size: 12.5px; color: var(--text-2); line-height: 1.6; user-select: text; }
.about-row { display: flex; align-items: center; gap: 10px; }
.about-github-label { font-size: 11.5px; color: var(--text-3); }
.about-link { color: var(--accent); text-decoration: none; font-family: var(--font-mono); font-size: 12.5px; user-select: text; }
.about-link:hover { text-decoration: underline; }

.update-banner { position: fixed; top: 10px; left: 50%; transform: translateX(-50%); z-index: 400; display: flex; align-items: center; gap: 10px; background: var(--bg-elevated); border: 1px solid var(--accent); border-radius: 20px; padding: 6px 14px; font-size: 12px; color: var(--text-1); box-shadow: 0 8px 24px rgba(0,0,0,.4); }

/* --- Mobil arayüz (telefon / dikey tablet) --- */
.app.m-root { grid-template-rows: minmax(0, 1fr); height: 100dvh; }
.m-app { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; height: 100%; min-height: 0; }
.m-header { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: var(--bg-panel); border-bottom: 1px solid var(--border); }
.m-header .spacer { flex: 1; }
.m-content { min-height: 0; display: flex; }
.m-content > .panel { flex: 1; min-width: 0; }
.m-tabbar { display: flex; gap: 4px; background: var(--bg-panel); border-top: 1px solid var(--border); padding: 4px 6px calc(4px + env(safe-area-inset-bottom, 0px)); }
.m-tab { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 7px 2px; border-radius: var(--radius-sm); color: var(--text-3); font-size: 10px; min-height: 52px; justify-content: center; }
.m-tab.active { color: var(--accent); background: var(--accent-soft); }
.m-root .panel-header { flex-wrap: wrap; height: auto; min-height: 34px; padding: 4px 8px; row-gap: 4px; }
.m-root .icon-btn { min-width: 38px; min-height: 38px; }
.m-root .icon-btn.mini { min-width: 30px; min-height: 30px; }
.m-root .icon-btn.wide { padding: 0 6px; }
.m-root .transport { flex-wrap: wrap; height: auto; padding: 6px 8px; row-gap: 6px; }
.m-root .timeline-divider { display: none; }
.m-root .media-divider { display: none; }
.m-root .media-drop { grid-template-columns: repeat(3, 1fr); }
.m-root .insp-row { gap: 6px; }
.m-root .insp-label { width: 76px; }
.m-root .tl-header { padding: 0 6px 0 2px; }
.m-root .tl-headers .tl-header { flex-wrap: wrap; height: auto; min-height: 40px; }
.m-root .cwheels-row { flex-wrap: wrap; }
.m-root .dialog { width: calc(100vw - 24px); }
.m-root .export-twin { grid-template-columns: 1fr; }
.m-root .container-grid { grid-template-columns: repeat(2, 1fr); }
.m-root .container-grid.codec-grid { grid-template-columns: repeat(2, 1fr); }
/* dokunma: sürükleme yüzeyleri sayfa kaydırmasın */
.tl-clip, .tl-ruler, .tf-box, .tf-handle, .tf-rotate-zone, .cwheel-pad, .tl-grip, .tl-trim-handle { touch-action: none; }
.m-root .tf-handle { width: 18px; height: 18px; }
.m-root .tf-rotate-zone { width: 30px; height: 30px; }
.m-root .tl-trim-handle { width: 24px; }
.m-root .insp-value { width: 46px; }

/* --- Açık tema: zaman çizgisi parçaları --- */
[data-theme='light'] .tl-lane { background: repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.03) 0 1px, transparent 1px 100%), var(--bg-panel-2); background-size: 24px 100%; }
[data-theme='light'] .tl-lane.audio { background: repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.025) 0 1px, transparent 1px 100%), #edf2ee; background-size: 24px 100%; }
[data-theme='light'] .tl-header.audio { background: #eef3ef; }
[data-theme='light'] .tl-clip.video { background: linear-gradient(180deg, #d7e3f5 0%, #c4d5ee 100%); border-color: #9db9e0; }
[data-theme='light'] .tl-clip.audio { background: linear-gradient(180deg, #d3e8d8 0%, #c1ddc9 100%); border-color: #9cc7a8; }
[data-theme='light'] .tl-clip.text { background: linear-gradient(180deg, #e2d8f2 0%, #d4c6ea 100%); border-color: #b3a0d4; }
[data-theme='light'] .tl-clip-name { color: #2a2f38; }
[data-theme='light'] .tl-text-preview { color: #5c4a7d; }
[data-theme='light'] .tl-speed-badge { color: #8a5d00; }
[data-theme='light'] .tl-trim-handle span { background: rgba(0, 0, 0, 0.45); }
[data-theme='light'] .tl-clip.selected .tl-trim-handle span { background: #1b1f26; }
[data-theme='light'] .preview-stage { background: linear-gradient(45deg, #e2e5ea 25%, transparent 25%), linear-gradient(-45deg, #e2e5ea 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e5ea 75%), linear-gradient(-45deg, transparent 75%, #e2e5ea 75%), #e8eaee; background-size: 22px 22px; background-position: 0 0, 0 11px, 11px -11px, -11px 0; }
`;
