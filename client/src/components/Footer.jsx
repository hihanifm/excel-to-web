import { useApiStatus } from '../App';

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.1';
const APP_NAME = 'Excel Data Labeling';

export default function Footer() {
  const { apiStatus } = useApiStatus();
  const mode = import.meta.env.DEV ? 'dev' : 'prod';

  const statusLabel = apiStatus === 'ok' ? 'API OK' : apiStatus === 'offline' ? 'API offline' : apiStatus === 'error' ? 'API error' : '—';
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
