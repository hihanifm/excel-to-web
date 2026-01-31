import { useState, useEffect, useRef, Fragment } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';

const CLAIMANT_STORAGE_KEY = (sessionId) => `excel-app_claimant_${sessionId}`;
const LAST_VIEWED_OFFSET_KEY = (sessionId, chunkIndex) => `excel-app_lastOffset_${sessionId}_chunk_${chunkIndex}`;
const LAST_UPDATED_ROW_KEY = (sessionId, chunkIndex) => `excel-app_lastUpdatedRow_${sessionId}_chunk_${chunkIndex}`;
const ROWS_PER_VIEW_KEY = 'excel-app_rowsPerView';
const AUTO_ADVANCE_KEY = 'excel-app_autoAdvance';
const SOUND_ON_SELECT_KEY = 'excel-app_soundOnSelect';

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
const getStoredSoundOnSelect = () => {
  if (typeof sessionStorage === 'undefined') return true;
  const v = sessionStorage.getItem(SOUND_ON_SELECT_KEY);
  return v !== 'false';
};

/** Play a short tone when user selects an option (Web Audio API, no assets). */
function playSelectionSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 523;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
  } catch (_) {}
}

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
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [resumeChecked, setResumeChecked] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(getStoredAutoAdvance);
  const [soundOnSelect, setSoundOnSelect] = useState(getStoredSoundOnSelect);
  const [userSelectedRowOffsets, setUserSelectedRowOffsets] = useState(() => new Set());
  const [goToRowInput, setGoToRowInput] = useState('');
  const [chunkTag, setChunkTag] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const persistedAssigneeRef = useRef(''); // Last known assignee in DB (for name-edit API)

  // Reset chunk-specific state when switching to a different chunk so we always re-fetch and re-evaluate.
  // Do not overwrite name from sessionStorage here — keep current name so "Your name" stays correct when opening another chunk (avoids showing a stale/cached value like "h1").
  useEffect(() => {
    setClaimed(false);
    setResumeChecked(false);
    setOffset(0);
    setData({ rows: [], totalInChunk: 0, targetOptions: [] });
    setChunkTag('');
    persistedAssigneeRef.current = '';
  }, [id, chunkIndex]);

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

  // On mount: if chunk is already claimed by the same user (stored name or resume link), skip claim form and resume from last viewed row.
  // Prefer resumeWithName from the Resume link over sessionStorage, since storage is per-session and may be from a different chunk's assignee.
  useEffect(() => {
    if (resumeChecked || claimed) return;
    const storedName = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(CLAIMANT_STORAGE_KEY(id)) : null;
    const resumeWithName = location.state?.resumeWithName;
    const effectiveName = (resumeWithName || storedName || '').trim();
    const norm = (s) => (s || '').trim().toLowerCase();

    const ac = new AbortController();
    fetch(`/api/sessions/${id}/chunks/${chunkIndex}`, { signal: ac.signal, cache: 'no-store' })
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((chunk) => {
        if (!chunk) {
          setResumeChecked(true);
          return;
        }
        setChunkTag(chunk.tag ?? '');
        const assignee = (chunk.assignee_name || '').trim();
        if (effectiveName && norm(chunk.assignee_name) === norm(effectiveName)) {
          const nameVal = assignee || effectiveName;
          setName(nameVal);
          persistedAssigneeRef.current = nameVal.trim();
          setClaimed(true);
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(CLAIMANT_STORAGE_KEY(id), (assignee || effectiveName).trim());
          }
          const totalInChunk = chunk.rowsInChunk ?? chunk.end_row - chunk.start_row;
          const storedOffset = typeof sessionStorage !== 'undefined'
            ? sessionStorage.getItem(LAST_VIEWED_OFFSET_KEY(id, chunkIndex))
            : null;
          const resumeOffset = storedOffset != null
            ? Math.min(Math.max(0, parseInt(storedOffset, 10)), Math.max(0, totalInChunk - 1))
            : Math.min(chunk.rowsEditedInChunk ?? 0, Math.max(0, totalInChunk - 1));
          setOffset(resumeOffset);
        }
        setResumeChecked(true);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setResumeChecked(true);
      });
    return () => ac.abort();
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

  const handleSaveName = (newName) => {
    const trimmed = (newName ?? '').trim();
    const currentPersisted = persistedAssigneeRef.current;
    if (!trimmed || trimmed === currentPersisted) return;
    setNameSaving(true);
    fetch(`/api/sessions/${id}/chunks/${chunkIndex}/assignee`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentName: currentPersisted, newName: trimmed }),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((d) => { throw new Error(d.error || 'Failed to update name'); });
        return r.json();
      })
      .then(() => {
        persistedAssigneeRef.current = trimmed;
        setName(trimmed);
        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(CLAIMANT_STORAGE_KEY(id), trimmed);
      })
      .catch((err) => setError(err.message))
      .finally(() => setNameSaving(false));
  };

  const handleClaim = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Enter your name');
      return;
    }
    setClaimSubmitting(true);
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
      persistedAssigneeRef.current = trimmedName;
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(CLAIMANT_STORAGE_KEY(id), trimmedName);
      setClaimed(true);
      setOffset(0);
      loadRows(0, limit);
    } catch (err) {
      setError(err.name === 'AbortError' ? 'Request timed out. Check that the server is running.' : (err.message || 'Claim failed'));
    } finally {
      setClaimSubmitting(false);
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
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(LAST_UPDATED_ROW_KEY(id, chunkIndex), String(rowOffsetInChunk));
        }
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
        navigate(`/sessions/${id}`, { replace: true });
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

  const chunkStart1 = data.chunkStartRow != null ? data.chunkStartRow + 1 : 1;
  const chunkEnd1 = data.chunkEndRow != null ? data.chunkEndRow : data.totalInChunk;
  const currentStartRow = data.chunkStartRow != null ? data.chunkStartRow + offset + 1 : offset + 1;
  const rangeStr = data.chunkStartRow != null && data.chunkEndRow != null ? `${chunkStart1}–${chunkEnd1}` : String(data.totalInChunk ?? '');

  const applyGoToRow = (val) => {
    const parsed = parseInt(String(val).trim(), 10);
    if (Number.isNaN(parsed) || data.totalInChunk === 0) return;
    const minRow = chunkStart1;
    const maxRow = chunkEnd1 - limit + 1;
    const targetRow = Math.min(Math.max(parsed, minRow), maxRow);
    const newOffset = Math.max(0, targetRow - chunkStart1);
    setOffset(newOffset);
    loadRows(newOffset, limit);
    setGoToRowInput('');
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  };

  if (!claimed) {
    const storedName = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(CLAIMANT_STORAGE_KEY(id)) : null;
    const mayResume = (storedName?.trim() || location.state?.resumeWithName?.trim());
    if (!resumeChecked) {
      return (
        <div className="card">
          <p style={{ margin: '0 0 0.5rem 0' }}><button type="button" className="btn-nav" onClick={() => navigate(`/sessions/${id}`, { replace: true })}>← Back to session</button></p>
          <h1 style={{ margin: 0 }}>Chunk {Number(chunkIndex) + 1}</h1>
          <p>{mayResume ? 'Resuming...' : 'Loading...'}</p>
        </div>
      );
    }
    return (
      <div className="card">
        <p style={{ margin: '0 0 0.5rem 0' }}><button type="button" className="btn-nav" onClick={() => navigate(`/sessions/${id}`, { replace: true })}>← Back to session</button></p>
        <p style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap', margin: 0 }}>
          <h1 style={{ margin: 0 }}>Chunk {Number(chunkIndex) + 1}</h1>
          {chunkTag?.trim() && (
            <span style={{ color: '#555', fontSize: '0.95rem' }}>Tag: <strong>{chunkTag.trim()}</strong></span>
          )}
        </p>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <form onSubmit={handleClaim}>
          <p>
            <label>Your name: </label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </p>
          <button type="submit" className="primary" disabled={claimSubmitting}>
            {claimSubmitting ? 'Claiming...' : 'Claim chunk'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="card">
      <p style={{ margin: '0 0 0.5rem 0' }}>
        <button type="button" className="btn-nav" onClick={() => navigate(`/sessions/${id}`, { replace: true })}>← Back to session</button>
      </p>
      <p style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', margin: 0, justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Chunk {Number(chunkIndex) + 1}</h1>
        <span style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {chunkTag?.trim() && (
            <span style={{ color: '#555', fontSize: '0.9rem' }}>Tag: <strong>{chunkTag.trim()}</strong></span>
          )}
          {name?.trim() && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#555', fontSize: '0.9rem' }} title="Edit your name">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={(e) => handleSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.target.blur();
                  }
                }}
                disabled={nameSaving}
                aria-label="Assignee name"
                style={{
                  width: '6rem',
                  minWidth: '4rem',
                  maxWidth: '12rem',
                  padding: '0.2rem 0.4rem',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  border: '1px solid transparent',
                  borderRadius: 4,
                  background: 'transparent',
                  color: 'inherit',
                }}
                className="name-input-editable"
              />
            </span>
          )}
        </span>
      </p>
      <p>
        Records per view:{' '}
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
        {' '}
        <label style={{ marginLeft: '1rem' }}>
          <input type="checkbox" checked={soundOnSelect} onChange={(e) => {
          const checked = e.target.checked;
          setSoundOnSelect(checked);
          if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(SOUND_ON_SELECT_KEY, checked ? 'true' : 'false');
        }} />
          {' '}Play sound on selection
        </label>
      </p>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {loading && data.rows.length === 0 ? (
        <p>Loading...</p>
      ) : (
        <>
          <p style={{ textAlign: 'right', margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span>Row</span>
            <input
              type="number"
              min={chunkStart1}
              max={chunkEnd1}
              value={goToRowInput !== '' ? goToRowInput : currentStartRow}
              onFocus={() => setGoToRowInput(String(currentStartRow))}
              onChange={(e) => setGoToRowInput(e.target.value)}
              onBlur={(e) => applyGoToRow(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyGoToRow(e.target.value);
                  e.target.blur();
                }
              }}
              style={{ width: '4rem', textAlign: 'right' }}
              aria-label="Go to row number"
            />
            <span>of {rangeStr}</span>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {data.rows?.map((row) => (
              <div key={row.rowIndex} className="card card-row" style={{ width: '100%' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <strong style={{ fontSize: '0.9rem', color: '#555' }}>Row {row.rowIndex + 1}</strong>
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
                    <strong>Labels</strong>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                      {(data.targetOptions || []).map((opt) => {
                          const isSelected = row.targetCurrentValue === opt;
                          const isUserSelected = userSelectedRowOffsets.has(row.rowOffsetInChunk);
                          const btnClass = !isSelected ? '' : isUserSelected ? 'btn-selected-warm' : 'primary';
                          return (
                        <button
                          key={opt}
                          type="button"
                          className={btnClass}
                          onClick={() => {
                            if (soundOnSelect) playSelectionSound();
                            // Always show orange when user clicks (even if same pre-selected option)
                            setUserSelectedRowOffsets((prev) => new Set(prev).add(row.rowOffsetInChunk));
                            if (opt !== row.targetCurrentValue) {
                              // Optimistic: update selection, pause 300ms, then save and advance
                              setData((prev) => ({
                                ...prev,
                                rows: prev.rows.map((r) =>
                                  r.rowOffsetInChunk === row.rowOffsetInChunk
                                    ? { ...r, targetCurrentValue: opt }
                                    : r
                                ),
                              }));
                              const rowOffset = row.rowOffsetInChunk;
                              setTimeout(() => handleSetValue(rowOffset, opt), 300);
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
                          );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="btn-nav" style={{ flex: 1 }} onClick={goPrev} disabled={offset === 0}>Prev (left arrow)</button>
            {(() => {
              if (typeof sessionStorage === 'undefined' || !data.totalInChunk) return null;
              const v = sessionStorage.getItem(LAST_UPDATED_ROW_KEY(id, chunkIndex));
              const rowOff = v != null ? parseInt(v, 10) : NaN;
              if (Number.isNaN(rowOff) || rowOff < 0 || rowOff >= data.totalInChunk) return null;
              const displayRow = data.chunkStartRow != null ? data.chunkStartRow + rowOff + 1 : rowOff + 1;
              return (
                <button
                  type="button"
                  className="btn-nav"
                  onClick={() => {
                    setOffset(rowOff);
                    loadRows(rowOff, limit);
                    setGoToRowInput('');
                    if (typeof window !== 'undefined') window.scrollTo(0, 0);
                  }}
                >
                  Go to last updated (row {displayRow})
                </button>
              );
            })()}
            <button type="button" className="btn-nav" style={{ flex: 1 }} onClick={goNext} disabled={offset + limit >= data.totalInChunk}>Next (right arrow)</button>
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
