import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApiStatus } from '../App';

export default function SessionList() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const { setApiStatus } = useApiStatus();

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
        <h1>Sessions</h1>
        <p>No sessions yet. <Link to="/create">Create a session</Link> to get started.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h1>Sessions</h1>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {sessions.map((s) => (
          <li key={s.id} style={{ marginBottom: '0.5rem' }}>
            <Link to={`/sessions/${s.id}`}>
              Session {s.id}
              {s.name ? ` – ${s.name}` : ''}
              {s.creator_name ? ` by ${s.creator_name}` : ''}
              {s.total_rows != null ? ` (${s.total_rows} rows)` : ''}
              {s.hasConfig ? ' ✓ configured' : ' – not configured'}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
