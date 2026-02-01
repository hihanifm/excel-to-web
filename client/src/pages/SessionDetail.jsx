import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

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
  const [editingTagChunkId, setEditingTagChunkId] = useState(null);
  const [tagSavingChunkId, setTagSavingChunkId] = useState(null);
  const [editingAssigneeChunkId, setEditingAssigneeChunkId] = useState(null);
  const [assigneeSavingChunkId, setAssigneeSavingChunkId] = useState(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [editingSessionName, setEditingSessionName] = useState(false);
  const [nameSaving, setNameSaving] = useState(false);
  const tagInputRef = useRef(null);
  const assigneeInputRef = useRef(null);
  const sessionNameInputRef = useRef(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch(`/api/sessions/${id}`, { cache: 'no-store' }).then((r) => r.json()),
      fetch(`/api/sessions/${id}/stats`, { cache: 'no-store' }).then((r) => r.json()),
      fetch(`/api/sessions/${id}/chunks`, { cache: 'no-store' }).then((r) => r.json()),
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
    if (editingTagChunkId != null) tagInputRef.current?.focus();
  }, [editingTagChunkId]);

  useEffect(() => {
    if (editingAssigneeChunkId != null) assigneeInputRef.current?.focus();
  }, [editingAssigneeChunkId]);

  useEffect(() => {
    if (editingSessionName) sessionNameInputRef.current?.focus();
  }, [editingSessionName]);

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

  const handleSaveTag = (chunkId, value) => {
    const tag = (value ?? '').trim();
    setEditingTagChunkId(null);
    setTagSavingChunkId(chunkId);
    fetch(`/api/sessions/${id}/chunks/${chunkId}/tag`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag }),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((d) => { throw new Error(d.error || 'Failed to save tag'); });
        return r.json();
      })
      .then(() => {
        setChunks((prev) => prev.map((c) => (c.id === chunkId ? { ...c, tag } : c)));
      })
      .catch(console.error)
      .finally(() => setTagSavingChunkId(null));
  };

  const handleTagKeyDown = (chunkId, currentValue, e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveTag(chunkId, currentValue);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setEditingTagChunkId(null);
    }
  };

  const handleSaveAssignee = (chunkId, value, currentAssigneeName, isContainer) => {
    const name = (value ?? '').trim();
    setEditingAssigneeChunkId(null);
    setAssigneeSavingChunkId(chunkId);
    const isClaim = !currentAssigneeName && !isContainer;
    const url = `/api/sessions/${id}/chunks/${chunkId}/${isClaim ? 'claim' : 'assignee'}`;
    const body = isClaim ? { name } : { currentName: currentAssigneeName, newName: name };
    if (isClaim && !name) {
      setAssigneeSavingChunkId(null);
      return;
    }
    if (!isClaim && !name) {
      setAssigneeSavingChunkId(null);
      return;
    }
    fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((d) => { throw new Error(d.error || (isClaim ? 'Claim failed' : 'Failed to update assignee')); });
        return r.json();
      })
      .then(() => {
        setChunks((prev) => prev.map((c) => (c.id === chunkId ? { ...c, assignee_name: name, status: isClaim ? 'in_progress' : c.status } : c)));
        load();
      })
      .catch(console.error)
      .finally(() => setAssigneeSavingChunkId(null));
  };

  const handleAssigneeKeyDown = (chunkId, currentValue, currentAssigneeName, isContainer, e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveAssignee(chunkId, currentValue, currentAssigneeName, isContainer);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setEditingAssigneeChunkId(null);
    }
  };

  const handleSaveSessionName = (value) => {
    const name = (value ?? '').trim();
    setEditingSessionName(false);
    setNameSaving(true);
    fetch(`/api/sessions/${id}/name`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name || null }),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((d) => { throw new Error(d.error || 'Failed to save name'); });
        return r.json();
      })
      .then(() => {
        setSession((s) => s ? { ...s, name: name || null } : s);
      })
      .catch(console.error)
      .finally(() => setNameSaving(false));
  };

  const handleSessionNameKeyDown = (currentValue, e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveSessionName(currentValue);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setEditingSessionName(false);
    }
  };

  if (loading && !session) return <div className="card">Loading...</div>;
  if (!session) return <div className="card">Project not found.</div>;

  return (
    <div className="card">
      <header className="chunk-editor-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {editingSessionName ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                ref={sessionNameInputRef}
                type="text"
                defaultValue={session.name?.trim() || ''}
                disabled={nameSaving}
                onBlur={() => handleSaveSessionName(sessionNameInputRef.current?.value)}
                onKeyDown={(e) => handleSessionNameKeyDown(sessionNameInputRef.current?.value, e)}
                placeholder="Project name"
                style={{ fontSize: '1.5rem', fontWeight: 700, minWidth: '12rem', maxWidth: '100%', boxSizing: 'border-box' }}
                className="form-input"
              />
            </span>
          ) : (
            <>
              <h1 style={{ margin: 0 }}>{session.name?.trim() || `Project ${id}`}</h1>
              <button
                type="button"
                className="btn-link chunk-edit-icon-btn"
                onClick={() => setEditingSessionName(true)}
                aria-label="Edit project name"
                title="Edit project name"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </>
          )}
          <span className={`status-badge status-${session.status}`}>
            {session.status === 'configured' ? 'Active' : session.status.charAt(0).toUpperCase() + session.status.slice(1)}
          </span>
        </div>
        <div className="form-actions-buttons" style={{ margin: 0 }}>
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
            Export Excel
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={() => { setDeleteConfirmOpen(true); setDeleteStep('confirm'); setDeletePin(''); setDeleteError(''); }}
          >
            Delete
          </button>
        </div>
      </header>

      {exporting && (
        <div className="export-progress-overlay" role="status" aria-live="polite" aria-label="Export in progress">
          <div className="export-progress-backdrop" />
          <div className="export-progress-card">
            <div className="export-progress-spinner" aria-hidden="true" />
            <p className="export-progress-message">Preparing export…</p>
            <p className="export-progress-hint">This may take a moment for large sheets.</p>
            <div className="export-progress-bar" aria-hidden="true">
              <div className="export-progress-bar-fill" />
            </div>
          </div>
        </div>
      )}

      {exportError && <p style={{ color: '#dc2626', margin: '0.5rem 0 0' }}>{exportError}</p>}

      {stats && (
        <div className="card card-stats" style={{ marginTop: '1.5rem' }}>
          <h2 className="section-title">📋 Overview</h2>
          <div className="stats-list">
            {session.original_filename && (
              <div className="stats-row">
                <span className="stats-label">Original file</span>
                <span className="stats-value">{session.original_filename}</span>
              </div>
            )}
            {session.creator_name && (
              <div className="stats-row">
                <span className="stats-label">Creator</span>
                <span className="stats-value">{session.creator_name}</span>
              </div>
            )}
            <div className="stats-row">
              <span className="stats-label">Created</span>
              <span className="stats-value">{formatDate(session.created_at)}</span>
            </div>
            <div className="stats-row">
              <span className="stats-label">Updated</span>
              <span className="stats-value">{formatDate(session.updated_at)}</span>
            </div>
            <div className="stats-row">
              <span className="stats-label">Chunks</span>
              <span className="stats-value">
                <strong>{stats.totalChunks}</strong> total
                {' · '}<strong>{stats.chunksCompleted}</strong> completed
                {' · '}<strong>{stats.chunksInProgress}</strong> in progress
                {' · '}<strong>{stats.chunksUnclaimed}</strong> unclaimed
              </span>
            </div>
            <div className="stats-row">
              <span className="stats-label">Records</span>
              <span className="stats-value">
                <strong>{stats.rowsEdited}</strong> / {stats.totalRows} edited
                {' · '}<strong>{stats.completionPct}%</strong> completion (chunks)
              </span>
            </div>
          </div>
          <div className="progress-bar" role="presentation" aria-hidden="true">
            <div className="progress-bar-fill" style={{ width: `${stats.completionPct}%` }} />
          </div>
        </div>
      )}

      <h2 className="section-title">📦 Chunks</h2>
      {deleteConfirmOpen && (
        <div className="card card-warning">
          {deleteStep === 'confirm' ? (
            <>
              <h3>Delete project?</h3>
              <p>Are you sure you want to delete this project? This cannot be undone.</p>
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
              <h3>Delete project</h3>
              <p>PIN is required to delete. Enter the PIN you set when creating this project, or the default PIN if you did not set one.</p>
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
              <th>Assignee</th>
              <th>Status</th>
              <th>Records</th>
              <th>Tag</th>
              <th>Progress</th>
            </tr>
          </thead>
          <tbody>
            {chunks.map((ch) => {
              const isContainer = (ch.childCount ?? 0) > 0;
              return (
                <tr
                  key={ch.id}
                  className={`chunk-row-clickable ${isContainer ? 'chunk-row-container' : 'chunk-row-leaf'} chunk-status-${ch.status ?? 'unclaimed'}`}
                  onClick={() => {
                    if (isContainer) navigate(`/sessions/${id}/chunks/${ch.id}`);
                    else navigate(`/sessions/${id}/chunks/${ch.id}/edit`, {
                      state: ch.status !== 'unclaimed' && ch.assignee_name ? { resumeWithName: ch.assignee_name } : undefined,
                    });
                  }}
                >
                  <td>
                    <span className="chunk-type-icon" aria-hidden="true" title={isContainer ? `Container (${ch.childCount ?? 0} sub-chunks)` : 'Leaf chunk'}>
                      {isContainer ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                      )}
                    </span>
                    {ch.chunk_index + 1}
                    {isContainer && (ch.childCount ?? 0) > 0 ? (
                      <span className="chunk-subcount" title={`${ch.childCount} sub-chunks`}> ({ch.childCount})</span>
                    ) : null}
                  </td>
                  <td>
                    {editingAssigneeChunkId === ch.id ? (
                      <span onClick={(e) => e.stopPropagation()}>
                        <input
                          ref={assigneeInputRef}
                          type="text"
                          defaultValue={ch.assignee_name ?? ''}
                          disabled={assigneeSavingChunkId === ch.id}
                          onBlur={() => handleSaveAssignee(ch.id, assigneeInputRef.current?.value, ch.assignee_name ?? '', isContainer)}
                          onKeyDown={(e) => handleAssigneeKeyDown(ch.id, assigneeInputRef.current?.value, ch.assignee_name ?? '', isContainer, e)}
                          placeholder="Name"
                          style={{ width: '100%', minWidth: '6rem', boxSizing: 'border-box' }}
                        />
                      </span>
                    ) : (
                      <>
                        <span style={{ color: (ch.assignee_name ?? '').trim() ? 'inherit' : '#94a3b8' }}>
                          {(ch.assignee_name ?? '').trim() || '–'}
                        </span>
                        <button
                          type="button"
                          className="btn-link chunk-edit-icon-btn"
                          onClick={(e) => { e.stopPropagation(); setEditingAssigneeChunkId(ch.id); }}
                          aria-label="Edit assignee"
                          title="Edit assignee"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                      </>
                    )}
                  </td>
                  <td>
                    <span className={`chunk-status-badge chunk-status-badge-${ch.status ?? 'unclaimed'}`}>
                      {ch.status === 'completed' ? 'Completed' : ch.status === 'in_progress' ? 'In progress' : 'Unclaimed'}
                    </span>
                  </td>
                  <td>
                    {(() => {
                      const count = ch.end_row - ch.start_row;
                      const total = stats?.totalRows ?? 0;
                      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                      return (
                        <>
                          {count} ({ch.start_row + 1}–{ch.end_row})
                          {total > 0 && <span className="chunk-records-pct"> · {pct}%</span>}
                        </>
                      );
                    })()}
                  </td>
                  <td>
                    {editingTagChunkId === ch.id ? (
                      <span onClick={(e) => e.stopPropagation()}>
                        <input
                          ref={tagInputRef}
                          type="text"
                          defaultValue={ch.tag ?? ''}
                          disabled={tagSavingChunkId === ch.id}
                          onBlur={() => handleSaveTag(ch.id, tagInputRef.current?.value)}
                          onKeyDown={(e) => handleTagKeyDown(ch.id, tagInputRef.current?.value, e)}
                          placeholder="Tag"
                          style={{ width: '100%', minWidth: '6rem', boxSizing: 'border-box' }}
                        />
                      </span>
                    ) : (
                      <>
                        <span style={{ color: (ch.tag ?? '').trim() ? 'inherit' : '#94a3b8' }}>
                          {(ch.tag ?? '').trim() || '–'}
                        </span>
                        <button
                          type="button"
                          className="btn-link chunk-edit-icon-btn"
                          onClick={(e) => { e.stopPropagation(); setEditingTagChunkId(ch.id); }}
                          aria-label="Edit tag"
                          title="Edit tag"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                      </>
                    )}
                  </td>
                  <td>
                    {(() => {
                      const edited = ch.rowsEditedInChunk ?? 0;
                      const total = ch.rowsInChunk ?? (ch.end_row - ch.start_row);
                      const pct = total > 0 ? Math.round((edited / total) * 100) : 0;
                      return (
                        <>
                          {edited} / {total}
                          {total > 0 && <span className="chunk-records-pct"> · {pct}%</span>}
                        </>
                      );
                    })()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
