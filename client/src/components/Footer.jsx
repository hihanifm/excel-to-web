import { useState, useEffect } from 'react';

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.1';
const APP_NAME = 'Excel Chunked Web App';

export default function Footer() {
  const [apiStatus, setApiStatus] = useState('checking');
  const mode = import.meta.env.DEV ? 'dev' : 'prod';

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      fetch('/api/sessions', { method: 'GET' })
        .then((r) => {
          if (cancelled) return;
          setApiStatus(r.ok ? 'ok' : 'error');
        })
        .catch(() => {
          if (!cancelled) setApiStatus('offline');
        });
    };
    check();
    const t = setInterval(check, 30000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const statusLabel = apiStatus === 'ok' ? 'API OK' : apiStatus === 'offline' ? 'API offline' : apiStatus === 'error' ? 'API error' : '…';
  const statusClass = apiStatus === 'ok' ? 'footer-status-ok' : apiStatus === 'offline' ? 'footer-status-offline' : '';

  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        <span className="app-footer-name">{APP_NAME}</span>
        <span className="app-footer-sep">|</span>
        <span>v{APP_VERSION}</span>
        <span className="app-footer-sep">|</span>
        <span className="app-footer-mode">{mode}</span>
        <span className="app-footer-sep">|</span>
        <span className={`footer-status ${statusClass}`}>{statusLabel}</span>
      </div>
    </footer>
  );
}
