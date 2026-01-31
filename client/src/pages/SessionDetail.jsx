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
  const [statusUpdating, setStatusUpdating] = useState(false);
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

  const handleStatusChange = (newStatus) => {
    setStatusUpdating(true);
    fetch(`/api/sessions/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((d) => { throw new Error(d.error || 'Failed to update status'); });
        return r.json();
      })
      .then(() => {
        setSession((s) => s ? { ...s, status: newStatus } : s);
      })
      .catch((err) => setExportError(err.message))
      .finally(() => setStatusUpdating(false));
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0 }}>Session {id}{session.name ? ` – ${session.name}` : ''}</h1>
            <span className={`status-badge status-${session.status}`}>
              {session.status === 'configured' ? 'Active' : session.status.charAt(0).toUpperCase() + session.status.slice(1)}
            </span>
          </div>
          <p style={{ margin: '0.25rem 0 0' }}>
            <Link to="/">← Sessions</Link>
          </p>
        </div>
        <div className="form-actions-buttons">
          {session.status === 'configured' && (
            <>
              <button
                type="button"
                className="btn-success"
                onClick={() => handleStatusChange('completed')}
                disabled={statusUpdating}
              >
                Mark Completed
              </button>
              <button
                type="button"
                className="btn-warning"
                onClick={() => handleStatusChange('discarded')}
                disabled={statusUpdating}
              >
                Discard
              </button>
            </>
          )}
          {(session.status === 'completed' || session.status === 'discarded') && (
            <button
              type="button"
              className="btn-nav"
              onClick={() => handleStatusChange('configured')}
              disabled={statusUpdating}
            >
              Reopen
            </button>
          )}
          <button className="primary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Export Excel'}
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={() => { setDeleteConfirmOpen(true); setDeleteStep('confirm'); setDeletePin(''); setDeleteError(''); }}
          >
            Delete
          </button>
        </div>
      </div>
      {exportError && <p style={{ color: '#dc2626', margin: '0.5rem 0 0' }}>{exportError}</p>}

      {stats && (
        <div className="card card-stats" style={{ marginTop: '1.5rem' }}>
          <h2>Stats</h2>
          <div className="stats-grid">
            {session.original_filename && (
              <p>Original file: <strong>{session.original_filename}</strong></p>
            )}
            {session.creator_name && (
              <p>Creator: <strong>{session.creator_name}</strong></p>
            )}
            <p>
              Total chunks: <strong>{stats.totalChunks}</strong>
              {' · '}
              Completed: <strong>{stats.chunksCompleted}</strong>
              {' · '}
              In progress: <strong>{stats.chunksInProgress}</strong>
              {' · '}
              Unclaimed: <strong>{stats.chunksUnclaimed}</strong>
            </p>
            <p>
              Records edited: <strong>{stats.rowsEdited}</strong> / {stats.totalRows}
              {' · '}
              Completion: <strong>{stats.completionPct}%</strong> (chunks)
            </p>
          </div>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${stats.completionPct}%` }} />
          </div>
        </div>
      )}

      <h2>Chunks</h2>
      {deleteConfirmOpen && (
        <div className="card card-warning">
          {deleteStep === 'confirm' ? (
            <>
              <h3>Delete session?</h3>
              <p>Are you sure you want to delete this session? This cannot be undone.</p>
              <div className="form-actions-buttons" style={{ marginTop: '0.75rem' }}>
                <button type="button" className="btn-danger" onClick={() => { setDeleteStep('pin'); setDeleteError(''); }}>
                  Yes, continue
                </button>
                <button type="button" onClick={() => { setDeleteConfirmOpen(false); setDeleteStep('confirm'); }}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <h3>Delete session</h3>
              <p>PIN is required to delete. Enter the PIN you set when creating this session, or the default PIN if you did not set one.</p>
              {deleteError && <p style={{ color: '#dc2626', margin: '0.5rem 0 0' }}>{deleteError}</p>}
              <div className="form-field" style={{ marginTop: '0.75rem', maxWidth: '20rem' }}>
                <label htmlFor="delete-pin" style={{ flex: '0 0 3rem' }}>PIN:</label>
                <input
                  id="delete-pin"
                  type="password"
                  value={deletePin}
                  onChange={(e) => setDeletePin(e.target.value)}
                  placeholder="Delete PIN (required)"
                  autoComplete="off"
                  className="form-input"
                  style={{ flex: '1 1 10rem' }}
                />
              </div>
              <div className="form-actions-buttons" style={{ marginTop: '0.75rem' }}>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={handleDelete}
                  disabled={deleting || !deletePin.trim()}
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
              </div>
            </>
          )}
        </div>
      )}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Chunk</th>
              <th>Records</th>
              <th>Status</th>
              <th>Assignee</th>
              <th>Tag</th>
              <th>Progress</th>
            </tr>
          </thead>
          <tbody>
            {chunks.map((ch) => (
              <tr
                key={ch.chunk_index}
                className="chunk-row-clickable"
                onClick={() => navigate(`/sessions/${id}/chunks/${ch.chunk_index}/edit`, {
                  state: ch.status !== 'unclaimed' && ch.assignee_name ? { resumeWithName: ch.assignee_name } : undefined,
                })}
              >
                <td>{ch.chunk_index + 1}</td>
                <td>{ch.start_row + 1}–{ch.end_row}</td>
                <td>{ch.status}</td>
                <td>
                  {ch.status === 'unclaimed' ? (
                    <Link
                      className="link-action"
                      to={`/sessions/${id}/chunks/${ch.chunk_index}/edit`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Claim
                    </Link>
                  ) : (
                    ch.assignee_name || '–'
                  )}
                </td>
                <td onClick={(e) => e.stopPropagation()}>
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
                      className="btn-link"
                      onClick={() => setEditingTagChunkIndex(ch.chunk_index)}
                      style={{ color: (ch.tag ?? '').trim() ? 'inherit' : '#94a3b8' }}
                    >
                      {(ch.tag ?? '').trim() || 'Add tag'}
                    </button>
                  )}
                </td>
                <td>{ch.rowsEditedInChunk ?? 0} / {ch.rowsInChunk ?? (ch.end_row - ch.start_row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
