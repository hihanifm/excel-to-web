import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';

export default function ChunkDetail() {
  const { id, chunkId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [chunk, setChunk] = useState(null);
  const [chunks, setChunks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTagChunkId, setEditingTagChunkId] = useState(null);
  const [tagSavingChunkId, setTagSavingChunkId] = useState(null);
  const [editingAssigneeChunkId, setEditingAssigneeChunkId] = useState(null);
  const [assigneeSavingChunkId, setAssigneeSavingChunkId] = useState(null);
  const [parentAssigneeName, setParentAssigneeName] = useState('');
  const [parentAssigneeSaving, setParentAssigneeSaving] = useState(false);
  const [completeSubmitting, setCompleteSubmitting] = useState(false);
  const [completeError, setCompleteError] = useState('');
  const tagInputRef = useRef(null);
  const assigneeInputRef = useRef(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch(`/api/sessions/${id}`).then((r) => r.json()),
      fetch(`/api/sessions/${id}/chunks/${chunkId}`).then((r) => r.json()),
      fetch(`/api/sessions/${id}/chunks?parentId=${chunkId}`).then((r) => r.json()),
    ])
      .then(([s, c, ch]) => {
        setSession(s);
        setChunk(c);
        setChunks(ch);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [id, chunkId]);

  useEffect(() => {
    if (chunk?.assignee_name != null) setParentAssigneeName((chunk.assignee_name || '').trim());
  }, [chunk?.assignee_name]);

  useEffect(() => {
    if (editingTagChunkId != null) tagInputRef.current?.focus();
  }, [editingTagChunkId]);

  useEffect(() => {
    if (editingAssigneeChunkId != null) assigneeInputRef.current?.focus();
  }, [editingAssigneeChunkId]);

  // If chunk is leaf (no children), redirect to editor
  useEffect(() => {
    if (!loading && chunk && (chunk.childCount ?? 0) === 0) {
      navigate(`/sessions/${id}/chunks/${chunkId}/edit`, { replace: true });
    }
  }, [loading, chunk, id, chunkId, navigate]);

  const handleSaveTag = (cid, value) => {
    const tag = (value ?? '').trim();
    setEditingTagChunkId(null);
    setTagSavingChunkId(cid);
    fetch(`/api/sessions/${id}/chunks/${cid}/tag`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag }),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((d) => { throw new Error(d.error || 'Failed to save tag'); });
        return r.json();
      })
      .then(() => {
        setChunks((prev) => prev.map((c) => (c.id === cid ? { ...c, tag } : c)));
      })
      .catch(console.error)
      .finally(() => setTagSavingChunkId(null));
  };

  const handleTagKeyDown = (cid, currentValue, e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveTag(cid, currentValue);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setEditingTagChunkId(null);
    }
  };

  const handleSaveAssignee = (cid, value, currentAssigneeName, isContainer) => {
    const name = (value ?? '').trim();
    setEditingAssigneeChunkId(null);
    setAssigneeSavingChunkId(cid);
    const isClaim = !currentAssigneeName && !isContainer;
    const url = `/api/sessions/${id}/chunks/${cid}/${isClaim ? 'claim' : 'assignee'}`;
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
        setChunks((prev) => prev.map((c) => (c.id === cid ? { ...c, assignee_name: name, status: isClaim ? 'in_progress' : c.status } : c)));
        load();
      })
      .catch(console.error)
      .finally(() => setAssigneeSavingChunkId(null));
  };

  const handleAssigneeKeyDown = (cid, currentValue, currentAssigneeName, isContainer, e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveAssignee(cid, currentValue, currentAssigneeName, isContainer);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setEditingAssigneeChunkId(null);
    }
  };

  const handleSaveParentAssignee = (value) => {
    const newName = (value ?? '').trim();
    const currentName = (chunk?.assignee_name ?? '').trim();
    if (newName === currentName || !newName) return;
    setParentAssigneeSaving(true);
    fetch(`/api/sessions/${id}/chunks/${chunkId}/assignee`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentName, newName }),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((d) => { throw new Error(d.error || 'Failed to update assignee'); });
        return r.json();
      })
      .then(() => {
        setChunk((prev) => (prev ? { ...prev, assignee_name: newName } : prev));
      })
      .catch(console.error)
      .finally(() => setParentAssigneeSaving(false));
  };

  const handleCompleteParent = (e) => {
    e?.preventDefault();
    const name = (parentAssigneeName ?? '').trim();
    if (!name) return;
    setCompleteError('');
    setCompleteSubmitting(true);
    fetch(`/api/sessions/${id}/chunks/${chunkId}/complete`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((d) => { throw new Error(d.error || 'Failed to mark as completed'); });
        return r.json();
      })
      .then(() => {
        setChunk((prev) => (prev ? { ...prev, status: 'completed' } : prev));
        load();
      })
      .catch((err) => setCompleteError(err.message))
      .finally(() => setCompleteSubmitting(false));
  };

  if (loading && !chunk) return <div className="card">Loading...</div>;
  if (!session) return <div className="card">Project not found.</div>;
  if (!chunk) return <div className="card">Chunk not found.</div>;
  if ((chunk.childCount ?? 0) === 0) return <div className="card">Redirecting to editor...</div>;

  return (
    <div className="card">
      <header className="chunk-editor-header chunk-detail-header">
        <div className="chunk-detail-header-row">
          <div className="chunk-detail-header-left">
            <Link to={`/sessions/${id}`} replace className="link-action chunk-detail-back">
              ← Back to project
            </Link>
            <h1 className="chunk-detail-title">Chunk rows {chunk.start_row + 1}–{chunk.end_row}</h1>
          </div>
          <div className="chunk-detail-header-meta">
            {(chunk.assignee_name ?? '').trim() && (
              <span className="chunk-editor-assignee" style={{ fontWeight: 600, color: '#334155' }} title="Edit parent chunk assignee">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <input
                  type="text"
                  value={parentAssigneeName}
                  onChange={(e) => setParentAssigneeName(e.target.value)}
                  onBlur={(e) => handleSaveParentAssignee(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.target.blur();
                  }}
                  disabled={parentAssigneeSaving}
                  aria-label="Parent chunk assignee"
                  className="name-input-editable"
                  style={{
                    width: `${Math.max(6, Math.min((parentAssigneeName?.length ?? 0) + 2, 42))}ch`,
                    minWidth: '4rem',
                    maxWidth: '24rem',
                    padding: '0.2rem 0.4rem', fontSize: '0.9rem', fontWeight: 600,
                    border: '1px solid transparent', borderRadius: 4, background: 'transparent', color: 'inherit',
                  }}
                />
              </span>
            )}
            {chunk.status !== 'completed' && (chunk.assignee_name ?? '').trim() && (
              <button
                type="button"
                className="btn-success chunk-detail-complete-btn"
                onClick={handleCompleteParent}
                disabled={completeSubmitting || !(parentAssigneeName ?? '').trim()}
              >
                {completeSubmitting ? 'Marking...' : 'Mark parent as completed'}
              </button>
            )}
          </div>
        </div>
        {completeError && <p style={{ color: '#dc2626', margin: '0.5rem 0 0' }}>{completeError}</p>}
      </header>

      <h2>Sub-chunks</h2>
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
            {chunks.map((ch) => {
              const isContainer = (ch.childCount ?? 0) > 0;
              return (
                <tr
                  key={ch.id}
                  className={`chunk-row-clickable ${isContainer ? 'chunk-row-container' : 'chunk-row-leaf'}`}
                  onClick={() => {
                    if (isContainer) navigate(`/sessions/${id}/chunks/${ch.id}`);
                    else navigate(`/sessions/${id}/chunks/${ch.id}/edit`, {
                      state: ch.status !== 'unclaimed' && ch.assignee_name ? { resumeWithName: ch.assignee_name } : undefined,
                    });
                  }}
                >
                  <td>
                    <span className="chunk-type-icon" aria-hidden="true" title={isContainer ? 'Container (has sub-chunks)' : 'Leaf chunk'}>
                      {isContainer ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                      )}
                    </span>
                    {ch.chunk_index + 1}
                  </td>
                  <td>{ch.start_row + 1}–{ch.end_row}</td>
                  <td>{ch.status}</td>
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
                  <td>{ch.rowsEditedInChunk ?? 0} / {ch.rowsInChunk ?? (ch.end_row - ch.start_row)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
