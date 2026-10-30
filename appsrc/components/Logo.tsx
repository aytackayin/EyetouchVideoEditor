export function Logo() {
  return (
    <div className="logo" title="Eyetouch Video Editor">
      <svg className="logo-mark" width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <rect x="1" y="1" width="30" height="30" rx="7" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M13 9.5 L22 16 L13 22.5 Z" fill="currentColor" />
        <rect x="8" y="24.5" width="16" height="2.4" rx="1.2" fill="#2e3440" />
        <rect x="8" y="24.5" width="9" height="2.4" rx="1.2" fill="currentColor" />
      </svg>
      <div className="logo-text">
        <span className="logo-name">EYETOUCH</span>
        <span className="logo-sub">Video Editor</span>
      </div>
    </div>
  );
}
