import { useState, useEffect, Fragment } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';

const CLAIMANT_STORAGE_KEY = (sessionId) => `excel-app_claimant_${sessionId}`;
const LAST_VIEWED_OFFSET_KEY = (sessionId, chunkIndex) => `excel-app_lastOffset_${sessionId}_chunk_${chunkIndex}`;
const ROWS_PER_VIEW_KEY = 'excel-app_rowsPerView';
const AUTO_ADVANCE_KEY = 'excel-app_autoAdvance';

const getStoredRowsPerView = () => {
  if (typeof sessionStorage === 'undefined') return 1;
  const v = sessionStorage.getItem(ROWS_PER_VIEW_KEY);
  const n = parseInt(v, 10);
  return [1, 5, 10].includes(n) ? n : 1;
};
const getStoredAutoAdvance = () => {
  if (typeof sessionStorage === 'undefined') return true;
  const v = sessionStorage.getItem(AUTO_ADVANCE_KEY);
  return v !== 'false';
};

const TOKEN_PATTERN = /([A-Za-z][A-Za-z0-9_]*\s*:)/g;

/** Insert newline before each "token:" in conversation-style text for display. */
const formatConversation = (str) => {
  if (str == null || typeof str !== 'string') return '';
  return str.replace(/(\s+)([A-Za-z][A-Za-z0-9_]*\s*:)/g, '\n$2');
};

/** Split formatted conversation string and return React nodes with "token:" in bold. */
function renderConversation(str) {
  const formatted = formatConversation(str ?? '');
  const segments = formatted.split(TOKEN_PATTERN);
  return segments.map((seg, i) => (
    <Fragment key={i}>{i % 2 === 1 ? <strong>{seg}</strong> : seg}</Fragment>
  ));
}

export default function ChunkEditor() {
  const { id, chunkIndex } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [name, setName] = useState('');
  const [claimed, setClaimed] = useState(false);
  const [limit, setLimit] = useState(getStoredRowsPerView);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState({ rows: [], totalInChunk: 0, targetOptions: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resumeChecked, setResumeChecked] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(getStoredAutoAdvance);

  const loadRows = (off, lim) => {
    setLoading(true);
    setError('');
    fetch(`/api/sessions/${id}/chunks/${chunkIndex}/row/${off}?limit=${lim}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load rows');
        return r.json();
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  // On mount: if chunk is already claimed by the same user (stored name or resume link), skip claim form and resume from last viewed row
  useEffect(() => {
    if (resumeChecked || claimed) return;
    const storedName = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(CLAIMANT_STORAGE_KEY(id)) : null;
    const resumeWithName = location.state?.resumeWithName;
    const effectiveName = (storedName || resumeWithName || '').trim();
    const norm = (s) => (s || '').trim().toLowerCase();

    fetch(`/api/sessions/${id}/chunks`)
      .then((r) => r.ok ? r.json() : [])
      .then((chunks) => {
        const chunk = chunks.find((c) => String(c.chunk_index) === String(chunkIndex));
        if (!chunk) {
          setResumeChecked(true);
          return;
        }
        const assignee = (chunk.assignee_name || '').trim();
        if (effectiveName && norm(chunk.assignee_name) === norm(effectiveName)) {
          setName(assignee || effectiveName);
          setClaimed(true);
          if (resumeWithName && typeof sessionStorage !== 'undefined' && !storedName) {
            sessionStorage.setItem(CLAIMANT_STORAGE_KEY(id), (assignee || resumeWithName).trim());
          }
          const totalInChunk = chunk.rowsInChunk ?? chunk.end_row - chunk.start_row;
          const storedOffset = typeof sessionStorage !== 'undefined'
            ? sessionStorage.getItem(LAST_VIEWED_OFFSET_KEY(id, chunkIndex))
            : null;
          const resumeOffset = storedOffset != null
            ? Math.min(Math.max(0, parseInt(storedOffset, 10)), Math.max(0, totalInChunk - 1))
            : Math.min(chunk.rowsEditedInChunk ?? 0, Math.max(0, totalInChunk - 1));
          setOffset(resumeOffset);
        } else if (assignee) {
          setName(assignee);
        }
        setResumeChecked(true);
      })
      .catch(() => setResumeChecked(true));
  }, [id, chunkIndex, claimed, resumeChecked, location.state?.resumeWithName]);

  useEffect(() => {
    if (claimed) loadRows(offset, limit);
  }, [id, chunkIndex, claimed, offset, limit]);

  useEffect(() => {
    if (!claimed || typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(LAST_VIEWED_OFFSET_KEY(id, chunkIndex), String(offset));
  }, [id, chunkIndex, claimed, offset]);

  // Arrow keys: Left = Previous, Right = Next (only when not in an input/textarea/select)
  useEffect(() => {
    if (!claimed) return;
    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (offset > 0) goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (offset + limit < data.totalInChunk) goNext();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [claimed, offset, limit, data.totalInChunk]);

  const handleClaim = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Enter your name');
      return;
    }
    setLoading(true);
    setError('');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const r = await fetch(`/api/sessions/${id}/chunks/${chunkIndex}/claim`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!r.ok) {
        let msg = 'Claim failed';
        try {
          const d = await r.json();
          msg = d.error || msg;
        } catch (_) {
          const text = await r.text();
          if (text) msg = text.slice(0, 100);
        }
        throw new Error(msg);
      }
      const trimmedName = name.trim();
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(CLAIMANT_STORAGE_KEY(id), trimmedName);
      setClaimed(true);
      setOffset(0);
      loadRows(0, limit);
    } catch (err) {
      setError(err.name === 'AbortError' ? 'Request timed out. Check that the server is running.' : (err.message || 'Claim failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSetValue = (rowOffsetInChunk, targetValue) => {
    fetch(`/api/sessions/${id}/chunks/${chunkIndex}/row/${rowOffsetInChunk}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), targetValue }),
    })
      .then((r) => {
        if (!r.ok) throw new Error('Save failed');
        if (data.totalInChunk === 0) return;
        const idx = data.rows.findIndex((r) => r.rowOffsetInChunk === rowOffsetInChunk);
        if (idx >= 0 && idx < data.rows.length) {
          setData((prev) => ({
            ...prev,
            rows: prev.rows.map((row, i) =>
              i === idx ? { ...row, targetCurrentValue: targetValue } : row
            ),
          }));
        }
        const nextOffset = rowOffsetInChunk + 1;
        if (nextOffset >= data.totalInChunk) {
          loadRows(offset, limit);
        } else if (autoAdvance && data.rows.length === 1) {
          loadRows(offset + 1, limit);
          setOffset((o) => o + 1);
        }
      })
      .catch((err) => setError(err.message));
  };

  const handleComplete = () => {
    fetch(`/api/sessions/${id}/chunks/${chunkIndex}/complete`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 403 ? 'Not your chunk' : 'Failed');
        navigate(`/sessions/${id}`);
      })
      .catch((err) => setError(err.message));
  };

  const markCurrentPageAsViewed = () => {
    if (!name?.trim() || data.totalInChunk === 0) return;
    const rowOffsets = [];
    for (let i = 0; i < limit && offset + i < data.totalInChunk; i++) rowOffsets.push(offset + i);
    if (rowOffsets.length === 0) return;
    fetch(`/api/sessions/${id}/chunks/${chunkIndex}/rows-viewed`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), rowOffsets }),
    }).catch(() => {});
  };

  const goPrev = () => {
    markCurrentPageAsViewed();
    setOffset((o) => Math.max(0, o - limit));
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  };
  const goNext = () => {
    markCurrentPageAsViewed();
    setOffset((o) => Math.min(data.totalInChunk - limit, o + limit));
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  };

  if (!claimed) {
    const storedName = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(CLAIMANT_STORAGE_KEY(id)) : null;
    const mayResume = (storedName?.trim() || location.state?.resumeWithName?.trim());
    if (!resumeChecked && mayResume) {
      return (
        <div className="card">
          <p style={{ margin: '0 0 0.5rem 0' }}><button type="button" className="btn-nav" onClick={() => navigate(`/sessions/${id}`)}>← Back to session</button></p>
          <h1 style={{ margin: 0 }}>Chunk {Number(chunkIndex) + 1}</h1>
          <p>Resuming...</p>
        </div>
      );
    }
    return (
      <div className="card">
        <p style={{ margin: '0 0 0.5rem 0' }}><button type="button" className="btn-nav" onClick={() => navigate(`/sessions/${id}`)}>← Back to session</button></p>
        <h1 style={{ margin: 0 }}>Chunk {Number(chunkIndex) + 1}</h1>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <form onSubmit={handleClaim}>
          <p>
            <label>Your name: </label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </p>
          <button type="submit" className="primary" disabled={loading}>
            {loading ? 'Claiming...' : 'Claim chunk'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="card">
      <p style={{ margin: '0 0 0.5rem 0' }}>
        <button type="button" className="btn-nav" onClick={() => navigate(`/sessions/${id}`)}>← Back to session</button>
      </p>
      <p style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap', margin: 0 }}>
        <h1 style={{ margin: 0 }}>Chunk {Number(chunkIndex) + 1}</h1>
        {name?.trim() && (
          <span style={{ color: '#666' }}>Editing as: <strong>{name.trim()}</strong></span>
        )}
      </p>
      <p>
        Rows per view:{' '}
        <select value={limit} onChange={(e) => {
          const val = Number(e.target.value);
          setLimit(val);
          setOffset(0);
          loadRows(0, val);
          if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(ROWS_PER_VIEW_KEY, String(val));
        }}>
          {[1, 5, 10].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        {' '}
        <label style={{ marginLeft: '1rem' }}>
          <input type="checkbox" checked={autoAdvance} disabled={limit !== 1} onChange={(e) => {
          const checked = e.target.checked;
          setAutoAdvance(checked);
          if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(AUTO_ADVANCE_KEY, checked ? 'true' : 'false');
        }} />
          {' '}Auto-advance after saving {limit === 1 ? '(next row)' : ''}
        </label>
      </p>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {loading && data.rows.length === 0 ? (
        <p>Loading...</p>
      ) : (
        <>
          <p style={{ textAlign: 'right', margin: 0 }}>
            {(() => {
              const start = data.chunkStartRow != null ? (data.chunkStartRow + offset + 1) : (offset + 1);
              const end = data.chunkEndRow != null ? Math.min(data.chunkStartRow + offset + limit, data.chunkEndRow) : Math.min(offset + limit, data.totalInChunk);
              const range = data.chunkStartRow != null && data.chunkEndRow != null ? `${data.chunkStartRow + 1}–${data.chunkEndRow}` : data.totalInChunk;
              return start === end ? `Row ${start} of ${range}` : `Rows ${start}–${end} of ${range}`;
            })()}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {data.rows?.map((row) => (
              <div key={row.rowIndex} className="card card-row" style={{ width: '100%' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <strong>Left (read-only)</strong>
                    <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0' }}>
                      {Object.entries(row.leftValues || {}).map(([k, v], idx, arr) => (
                        <li
                          key={k}
                          style={{
                            borderBottom: idx < arr.length - 1 ? '1px solid #ddd' : undefined,
                            paddingBottom: idx < arr.length - 1 ? '0.75rem' : 0,
                            marginBottom: idx < arr.length - 1 ? '0.75rem' : 0,
                          }}
                        >
                          <strong>{k}:</strong>{' '}
                          <span style={{ whiteSpace: 'pre-wrap' }}>{renderConversation(v)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <strong>Target</strong>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                      {(data.targetOptions || []).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          className={row.targetCurrentValue === opt ? 'primary' : ''}
                          onClick={() => {
                            if (opt !== row.targetCurrentValue) {
                              handleSetValue(row.rowOffsetInChunk, opt);
                            } else if (autoAdvance && data.rows.length === 1 && offset + 1 < data.totalInChunk) {
                              fetch(`/api/sessions/${id}/chunks/${chunkIndex}/rows-viewed`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ name: name.trim(), rowOffsets: [row.rowOffsetInChunk] }),
                              }).catch(() => {});
                              loadRows(offset + 1, limit);
                              setOffset((o) => o + 1);
                            }
                          }}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn-nav" style={{ flex: 1 }} onClick={goPrev} disabled={offset === 0}>Previous</button>
            <button type="button" className="btn-nav" style={{ flex: 1 }} onClick={goNext} disabled={offset + limit >= data.totalInChunk}>Next</button>
          </p>
          <p style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="primary" onClick={handleComplete}>
              Mark chunk as completed
            </button>
          </p>
        </>
      )}
    </div>
  );
}
