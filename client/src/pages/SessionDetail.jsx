import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';

export default function SessionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [stats, setStats] = useState(null);
  const [chunks, setChunks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState('confirm'); // 'confirm' | 'pin'
  const [deletePin, setDeletePin] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [editingTagChunkIndex, setEditingTagChunkIndex] = useState(null);
  const [tagSavingChunkIndex, setTagSavingChunkIndex] = useState(null);
  const tagInputRef = useRef(null);

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

  useEffect(() => {
    if (editingTagChunkIndex != null) tagInputRef.current?.focus();
  }, [editingTagChunkIndex]);

  const handleDelete = () => {
    setDeleting(true);
    setDeleteError('');
    fetch(`/api/sessions/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: deletePin }),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((d) => { throw new Error(d.error || 'Delete failed'); });
        return r.json();
      })
      .then(() => {
        setDeleteConfirmOpen(false);
        setDeletePin('');
        navigate('/');
      })
      .catch((err) => setDeleteError(err.message))
      .finally(() => setDeleting(false));
  };

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

  const handleSaveTag = (chunkIndex, value) => {
    const tag = (value ?? '').trim();
    setEditingTagChunkIndex(null);
    setTagSavingChunkIndex(chunkIndex);
    fetch(`/api/sessions/${id}/chunks/${chunkIndex}/tag`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag }),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((d) => { throw new Error(d.error || 'Failed to save tag'); });
        return r.json();
      })
      .then(() => {
        setChunks((prev) => prev.map((c) => (c.chunk_index === chunkIndex ? { ...c, tag } : c)));
      })
      .catch(console.error)
      .finally(() => setTagSavingChunkIndex(null));
  };

  const handleTagKeyDown = (chunkIndex, currentValue, e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveTag(chunkIndex, currentValue);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setEditingTagChunkIndex(null);
    }
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
        <div className="card" style={{ background: '#f8fafc' }}>
          <h2>Stats</h2>
          {session.original_filename && (
            <p>
              Original file: <strong>{session.original_filename}</strong>
            </p>
          )}
          {session.creator_name && (
            <p>
              Creator: <strong>{session.creator_name}</strong>
            </p>
          )}
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
        {' '}
        <button
          type="button"
          onClick={() => { setDeleteConfirmOpen(true); setDeleteStep('confirm'); setDeletePin(''); setDeleteError(''); }}
          style={{ background: '#c62828', color: 'white', border: 'none' }}
        >
          Delete session
        </button>
      </p>
      {deleteConfirmOpen && (
        <div className="card" style={{ background: '#fff8e1', marginTop: '1rem' }}>
          {deleteStep === 'confirm' ? (
            <>
              <h3>Delete session?</h3>
              <p>Are you sure you want to delete this session? This cannot be undone.</p>
              <p>
                <button
                  type="button"
                  onClick={() => { setDeleteStep('pin'); setDeleteError(''); }}
                  style={{ background: '#c62828', color: 'white', border: 'none', marginRight: '0.5rem' }}
                >
                  Yes, continue
                </button>
                <button
                  type="button"
                  onClick={() => { setDeleteConfirmOpen(false); setDeleteStep('confirm'); }}
                >
                  Cancel
                </button>
              </p>
            </>
          ) : (
            <>
              <h3>Delete session</h3>
              <p>PIN is required to delete. Enter the PIN you set when creating this session, or the default PIN if you did not set one.</p>
              {deleteError && <p style={{ color: 'red' }}>{deleteError}</p>}
              <p>
                <label>
                  PIN:{' '}
                  <input
                    type="password"
                    value={deletePin}
                    onChange={(e) => setDeletePin(e.target.value)}
                    placeholder="Delete PIN (required)"
                    style={{ minWidth: '10rem' }}
                    autoComplete="off"
                  />
                </label>
              </p>
              <p>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting || !deletePin.trim()}
                  style={{ background: '#c62828', color: 'white', border: 'none', marginRight: '0.5rem' }}
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
                <button
                  type="button"
                  onClick={() => { setDeleteConfirmOpen(false); setDeletePin(''); setDeleteError(''); }}
                  disabled={deleting}
                >
                  Cancel
                </button>
              </p>
            </>
          )}
        </div>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #ccc' }}>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Chunk</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Rows</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Status</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Assignee</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Tag</th>
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
              <td style={{ padding: '0.5rem' }}>
                {editingTagChunkIndex === ch.chunk_index ? (
                  <input
                    ref={tagInputRef}
                    type="text"
                    defaultValue={ch.tag ?? ''}
                    disabled={tagSavingChunkIndex === ch.chunk_index}
                    onBlur={() => handleSaveTag(ch.chunk_index, tagInputRef.current?.value)}
                    onKeyDown={(e) => handleTagKeyDown(ch.chunk_index, tagInputRef.current?.value, e)}
                    placeholder="Tag"
                    style={{ width: '100%', minWidth: '6rem', boxSizing: 'border-box' }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingTagChunkIndex(ch.chunk_index)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      color: (ch.tag ?? '').trim() ? 'inherit' : '#888',
                      textAlign: 'left',
                      width: '100%',
                      minWidth: '6rem',
                    }}
                  >
                    {(ch.tag ?? '').trim() || 'Add tag'}
                  </button>
                )}
              </td>
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
