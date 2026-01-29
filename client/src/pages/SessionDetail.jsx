import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

export default function SessionDetail() {
  const { id } = useParams();
  const [session, setSession] = useState(null);
  const [stats, setStats] = useState(null);
  const [chunks, setChunks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch(`/api/sessions/${id}`).then((r) => r.json()),
      fetch(`/api/sessions/${id}/stats`).then((r) => r.json()),
      fetch(`/api/sessions/${id}/chunks`).then((r) => r.json()),
    ])
      .then(([s, st, ch]) => {
        setSession(s);
        setStats(st);
        setChunks(ch);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [id]);

  const handleExport = () => {
    setExporting(true);
    setExportError('');
    fetch(`/api/sessions/${id}/export`)
      .then((r) => {
        if (!r.ok) return r.json().then((d) => { throw new Error(d.error || 'Export failed'); });
        return r.blob();
      })
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `export-${id}.xlsx`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => setExportError(err.message))
      .finally(() => setExporting(false));
  };

  if (loading && !session) return <div className="card">Loading...</div>;
  if (!session) return <div className="card">Session not found.</div>;

  return (
    <div className="card">
      <h1>Session {id}{session.name ? ` – ${session.name}` : ''}</h1>
      <p>
        <Link to="/">← Sessions</Link>
      </p>

      {stats && (
        <div className="card" style={{ background: '#f9f9f9' }}>
          <h2>Stats</h2>
          <p>
            Total chunks: <strong>{stats.totalChunks}</strong>
            {' | '}
            Completed: <strong>{stats.chunksCompleted}</strong>
            {' | '}
            In progress: <strong>{stats.chunksInProgress}</strong>
            {' | '}
            Unclaimed: <strong>{stats.chunksUnclaimed}</strong>
          </p>
          <p>
            Rows edited: <strong>{stats.rowsEdited}</strong> / {stats.totalRows}
            {' | '}
            Completion: <strong>{stats.completionPct}%</strong> (chunks)
          </p>
          <div style={{ height: '12px', background: '#e0e0e0', borderRadius: 6, overflow: 'hidden' }}>
            <div
              style={{
                width: `${stats.completionPct}%`,
                height: '100%',
                background: '#2e7d32',
                transition: 'width 0.3s',
              }}
            />
          </div>
        </div>
      )}

      <h2>Chunks</h2>
      {exportError && <p style={{ color: 'red' }}>{exportError}</p>}
      <p>
        <button className="primary" onClick={handleExport} disabled={exporting}>
          {exporting ? 'Exporting...' : 'Export Excel'}
        </button>
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #ccc' }}>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Chunk</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Rows</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Status</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Assignee</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Progress</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {chunks.map((ch) => (
            <tr key={ch.chunk_index} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '0.5rem' }}>{ch.chunk_index + 1}</td>
              <td style={{ padding: '0.5rem' }}>{ch.start_row + 1}–{ch.end_row}</td>
              <td style={{ padding: '0.5rem' }}>{ch.status}</td>
              <td style={{ padding: '0.5rem' }}>{ch.assignee_name || '–'}</td>
              <td style={{ padding: '0.5rem' }}>{ch.rowsEditedInChunk ?? 0} / {ch.rowsInChunk ?? (ch.end_row - ch.start_row)}</td>
              <td style={{ padding: '0.5rem' }}>
                <Link
                  to={`/sessions/${id}/chunks/${ch.chunk_index}/edit`}
                  state={ch.status !== 'unclaimed' && ch.assignee_name ? { resumeWithName: ch.assignee_name } : undefined}
                >
                  {ch.status === 'unclaimed' ? 'Claim' : ch.assignee_name ? 'Resume' : 'View'}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
