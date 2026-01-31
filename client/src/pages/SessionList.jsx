import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApiStatus } from '../App';

/** Format ISO date string to a short readable format */
function formatDate(isoStr) {
  if (!isoStr) return '–';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return '–';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today, ${time}`;
  if (isYesterday) return `Yesterday, ${time}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + `, ${time}`;
}

export default function SessionList() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const { setApiStatus } = useApiStatus();
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/sessions')
      .then((r) => r.json())
      .then(setSessions)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Poll API status only while SessionList is mounted
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
    const t = setInterval(check, 180000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [setApiStatus]);

  if (loading) return <div className="card">Loading sessions...</div>;
  if (sessions.length === 0) {
    return (
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <h1 style={{ margin: 0 }}>Sessions</h1>
          <Link to="/create" className="btn-link-primary">+ New session</Link>
        </div>
        <p style={{ marginTop: '1.5rem', color: '#64748b' }}>No sessions yet. Create one to get started.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Sessions</h1>
        <Link to="/create" className="btn-link-primary">+ New session</Link>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Session</th>
              <th>Creator</th>
              <th>Records</th>
              <th>Created</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr
                key={s.id}
                className="session-row-clickable"
                onClick={() => navigate(`/sessions/${s.id}`)}
              >
                <td>
                  <span className="session-name">{s.name || `Session ${s.id}`}</span>
                  <span className="session-id">#{s.id}</span>
                </td>
                <td>{s.creator_name || '–'}</td>
                <td>{s.total_rows != null ? s.total_rows.toLocaleString() : '–'}</td>
                <td className="session-date">{formatDate(s.created_at)}</td>
                <td>
                  {s.status === 'completed' ? (
                    <span className="status-badge status-completed">Completed</span>
                  ) : s.status === 'discarded' ? (
                    <span className="status-badge status-discarded">Discarded</span>
                  ) : s.status === 'configured' ? (
                    <span className="status-badge status-configured">Active</span>
                  ) : (
                    <span className="status-badge status-pending">Not configured</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
