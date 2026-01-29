import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function SessionList() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/sessions')
      .then((r) => r.json())
      .then(setSessions)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

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
              {s.total_rows != null ? ` (${s.total_rows} rows)` : ''}
              {s.hasConfig ? ' ✓ configured' : ' – not configured'}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
