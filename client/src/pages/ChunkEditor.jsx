import { useState, useEffect, useRef, Fragment } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import ChunkingWidget from '../components/ChunkingWidget';

const CLAIMANT_STORAGE_KEY = (sessionId) => `excel-app_claimant_${sessionId}`;
const LAST_VIEWED_OFFSET_KEY = (sessionId, chunkId) => `excel-app_lastOffset_${sessionId}_chunk_${chunkId}`;
const LAST_UPDATED_ROW_KEY = (sessionId, chunkId) => `excel-app_lastUpdatedRow_${sessionId}_chunk_${chunkId}`;
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
  const { id, chunkId } = useParams();
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
  const [parentChunkId, setParentChunkId] = useState(null);
  const [autoAdvance, setAutoAdvance] = useState(getStoredAutoAdvance);
  const [soundOnSelect, setSoundOnSelect] = useState(getStoredSoundOnSelect);
  const [userSelectedRowOffsets, setUserSelectedRowOffsets] = useState(() => new Set());
  const [goToRowInput, setGoToRowInput] = useState('');
  const [chunkTag, setChunkTag] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showCompleteCelebration, setShowCompleteCelebration] = useState(false);
  const [completeCelebrationVariant, setCompleteCelebrationVariant] = useState('just_completed'); // 'just_completed' | 'already_completed'
  const [rechunkSubmitting, setRechunkSubmitting] = useState(false);
  const [rechunkError, setRechunkError] = useState('');
  const persistedAssigneeRef = useRef(''); // Last known assignee in DB (for name-edit API)

  // Reset chunk-specific state when switching to a different chunk so we always re-fetch and re-evaluate.
  // Do not overwrite name from sessionStorage here — keep current name so "Your name" stays correct when opening another chunk (avoids showing a stale/cached value like "h1").
  useEffect(() => {
    setClaimed(false);
    setResumeChecked(false);
    setOffset(0);
    setData({ rows: [], totalInChunk: 0, targetOptions: [] });
    setChunkTag('');
    setCompleteCelebrationVariant('just_completed');
    persistedAssigneeRef.current = '';
  }, [id, chunkId]);

  const loadRows = (off, lim) => {
    setLoading(true);
    setError('');
    fetch(`/api/sessions/${id}/chunks/${chunkId}/row/${off}?limit=${lim}`)
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
    fetch(`/api/sessions/${id}/chunks/${chunkId}`, { signal: ac.signal, cache: 'no-store' })
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((chunk) => {
        if (!chunk) {
          setResumeChecked(true);
          return;
        }
        if (chunk.parent_id != null) setParentChunkId(chunk.parent_id);
        if (chunk.status === 'completed') {
          setChunkTag(chunk.tag ?? '');
          setName((chunk.assignee_name || '').trim() || 'Completed');
          setClaimed(true);
          setOffset(0);
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
            ? sessionStorage.getItem(LAST_VIEWED_OFFSET_KEY(id, chunkId))
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
  }, [id, chunkId, claimed, resumeChecked, location.state?.resumeWithName]);

  useEffect(() => {
    if (claimed) loadRows(offset, limit);
  }, [id, chunkId, claimed, offset, limit]);

  useEffect(() => {
    if (!claimed || typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(LAST_VIEWED_OFFSET_KEY(id, chunkId), String(offset));
  }, [id, chunkId, claimed, offset]);

  // Arrow keys: Left/Right = Previous/Next. Number keys 1–9 = first–ninth label (when not in input/textarea/select)
  useEffect(() => {
    if (!claimed) return;
    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      // Cmd/Ctrl + Left/Right = browser back/forward; don't capture
      if (e.metaKey || e.ctrlKey) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (offset > 0) goPrev();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (offset + limit < data.totalInChunk) goNext();
        return;
      }
      const num = e.key >= '1' && e.key <= '9' ? parseInt(e.key, 10) : 0;
      if (num >= 1 && data.rows.length > 0 && data.targetOptions?.length > 0) {
        const optIndex = num - 1;
        if (optIndex < data.targetOptions.length) {
          const opt = data.targetOptions[optIndex];
          const row = data.rows[0];
          e.preventDefault();
          if (soundOnSelect) playSelectionSound();
          setUserSelectedRowOffsets((prev) => new Set(prev).add(row.rowOffsetInChunk));
          if (opt !== row.targetCurrentValue) {
            setData((prev) => ({
              ...prev,
              rows: prev.rows.map((r) =>
                r.rowOffsetInChunk === row.rowOffsetInChunk ? { ...r, targetCurrentValue: opt } : r
              ),
            }));
            setTimeout(() => handleSetValue(row.rowOffsetInChunk, opt), 100);
          } else if (autoAdvance && data.rows.length === 1 && offset + 1 < data.totalInChunk) {
            fetch(`/api/sessions/${id}/chunks/${chunkId}/rows-viewed`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: name.trim(), rowOffsets: [row.rowOffsetInChunk] }),
            }).catch(() => {});
            loadRows(offset + 1, limit);
            setOffset((o) => o + 1);
          }
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [claimed, offset, limit, data.totalInChunk, data.rows, data.targetOptions, soundOnSelect, autoAdvance, id, chunkId, name]);

  const handleSaveName = (newName) => {
    const trimmed = (newName ?? '').trim();
    const currentPersisted = persistedAssigneeRef.current;
    if (!trimmed || trimmed === currentPersisted) return;
    setNameSaving(true);
    fetch(`/api/sessions/${id}/chunks/${chunkId}/assignee`, {
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
      const r = await fetch(`/api/sessions/${id}/chunks/${chunkId}/claim`, {
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
    fetch(`/api/sessions/${id}/chunks/${chunkId}/row/${rowOffsetInChunk}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), targetValue }),
    })
      .then((r) => {
        if (!r.ok) throw new Error('Save failed');
        return r.json();
      })
      .then((res) => {
        if (data.totalInChunk === 0) return;
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(LAST_UPDATED_ROW_KEY(id, chunkId), String(rowOffsetInChunk));
        }
        const labeledFromServer = typeof res.labeledInChunk === 'number' ? res.labeledInChunk : undefined;
        const idx = data.rows.findIndex((r) => r.rowOffsetInChunk === rowOffsetInChunk);
        if (idx >= 0 && idx < data.rows.length) {
          setData((prev) => ({
            ...prev,
            rows: prev.rows.map((row, i) =>
              i === idx ? { ...row, targetCurrentValue: targetValue } : row
            ),
            labeledInChunk: labeledFromServer !== undefined ? labeledFromServer : (prev.labeledInChunk ?? 0),
          }));
        } else {
          setData((prev) => ({
            ...prev,
            labeledInChunk: labeledFromServer !== undefined ? labeledFromServer : (prev.labeledInChunk ?? 0),
          }));
        }
        const nextOffset = rowOffsetInChunk + 1;
        if (nextOffset >= data.totalInChunk) {
          loadRows(offset, limit);
        } else if (autoAdvance && data.rows.length === 1) {
          loadRows(offset + 1, limit);
          setOffset((o) => o + 1);
        } else {
          loadRows(offset, limit);
        }
        // All records in chunk are now labeled → complete chunk and show celebration (same as clicking "Mark chunk as completed").
        if (labeledFromServer === data.totalInChunk && data.totalInChunk > 0) {
          fetch(`/api/sessions/${id}/chunks/${chunkId}/complete`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim() }),
          })
            .then((r) => {
              if (!r.ok) return;
              setShowCompleteCelebration(true);
            })
            .catch(() => {});
        }
      })
      .catch((err) => setError(err.message));
  };

  const handleComplete = () => {
    fetch(`/api/sessions/${id}/chunks/${chunkId}/complete`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 403 ? 'Not your chunk' : 'Failed');
        setShowCompleteCelebration(true);
      })
      .catch((err) => setError(err.message));
  };

  const backUrl = parentChunkId != null ? `/sessions/${id}/chunks/${parentChunkId}` : `/sessions/${id}`;

  // Redirect to parent chunk or session after celebration overlay (both "just completed" and "already completed").
  useEffect(() => {
    if (!showCompleteCelebration) return;
    const t = setTimeout(() => navigate(backUrl, { replace: true }), 4000);
    return () => clearTimeout(t);
  }, [showCompleteCelebration, backUrl, navigate]);

  const markCurrentPageAsViewed = () => {
    if (!name?.trim() || data.totalInChunk === 0) return;
    const rowOffsets = [];
    for (let i = 0; i < limit && offset + i < data.totalInChunk; i++) rowOffsets.push(offset + i);
    if (rowOffsets.length === 0) return;
    fetch(`/api/sessions/${id}/chunks/${chunkId}/rows-viewed`, {
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

  const handleRechunkSubmit = (body) => {
    setRechunkError('');
    setRechunkSubmitting(true);
    fetch(`/api/sessions/${id}/chunks/${chunkId}/rechunk`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((d) => { throw new Error(d.error || 'Re-chunk failed'); });
        return r.json();
      })
      .then(() => navigate(`/sessions/${id}/chunks/${chunkId}`, { replace: true }))
      .catch((err) => setRechunkError(err.message))
      .finally(() => setRechunkSubmitting(false));
  };

  if (!claimed) {
    const storedName = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(CLAIMANT_STORAGE_KEY(id)) : null;
    const mayResume = (storedName?.trim() || location.state?.resumeWithName?.trim());
    if (!resumeChecked) {
      return (
        <>
          <div className="chunk-editor-back">
            <button type="button" className="btn-nav" onClick={() => navigate(parentChunkId != null ? `/sessions/${id}/chunks/${parentChunkId}` : `/sessions/${id}`, { replace: true })}>← BACK</button>
          </div>
          <div className="card">
            <header className="chunk-editor-header">
              <h1>Chunk</h1>
            </header>
            <p className="chunk-editor-loading">{mayResume ? 'Resuming...' : 'Loading...'}</p>
          </div>
        </>
      );
    }
    return (
      <>
        <div className="chunk-editor-back">
          <button type="button" className="btn-nav" onClick={() => navigate(parentChunkId != null ? `/sessions/${id}/chunks/${parentChunkId}` : `/sessions/${id}`, { replace: true })}>← BACK</button>
        </div>
        <div className="card">
          <header className="chunk-editor-header">
            <h1>Chunk</h1>
            {chunkTag?.trim() && (
              <div className="chunk-editor-meta">
                <span>Tag: <strong>{chunkTag.trim()}</strong></span>
              </div>
            )}
          </header>
          {error && <p className="chunk-editor-error" role="alert">{error}</p>}
          <form onSubmit={handleClaim}>
            <div className="form-field">
              <label htmlFor="claim-name">Your name</label>
              <input id="claim-name" className="form-input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="form-field form-actions">
              <button type="submit" className="primary" disabled={claimSubmitting}>
                {claimSubmitting ? 'Claiming...' : 'Claim chunk'}
              </button>
            </div>
          </form>
        </div>
      </>
    );
  }

  return (
    <>
      {showCompleteCelebration && (
        <div className="chunk-complete-celebration" role="dialog" aria-live="polite" aria-label="Chunk completed">
          <div className="chunk-complete-celebration-backdrop" />
          <div className="chunk-complete-confetti" aria-hidden="true">
            {[...Array(48)].map((_, i) => (
              <div key={`c-${i}`} className="chunk-complete-confetti-piece" style={{ '--i': i, '--delay': (i % 8) * 0.06, '--size': 6 + (i % 5) }} />
            ))}
          </div>
          <div className="chunk-complete-balloons" aria-hidden="true">
            {[...Array(18)].map((_, i) => (
              <div key={`b-${i}`} className="chunk-complete-balloon" style={{ '--i': i, '--x': (i * 7 + 3) % 100, '--delay': (i % 6) * 0.2 }} />
            ))}
          </div>
          <div className="chunk-complete-stars" aria-hidden="true">
            {[...Array(24)].map((_, i) => (
              <div key={`s-${i}`} className="chunk-complete-star" style={{ '--i': i, '--x': (i * 11 + 5) % 100, '--y': (i * 13 + 7) % 100, '--delay': (i % 5) * 0.15 }} />
            ))}
          </div>
          <div className="chunk-complete-graffiti">
            <p className="chunk-complete-graffiti-title">CHUNK COMPLETED!</p>
            {completeCelebrationVariant === 'already_completed' ? (
              <>
                <p className="chunk-complete-graffiti-thanks">Thanks for helping to improve the accuracy of the data.</p>
                <p className="chunk-complete-graffiti-done">This chunk is already completed.</p>
              </>
            ) : (
              <>
                <p className="chunk-complete-graffiti-thanks">Thanks for your effort.</p>
                <p className="chunk-complete-graffiti-done">✓ Marked as completed</p>
              </>
            )}
          </div>
        </div>
      )}
      <div className="chunk-editor-back">
        <button type="button" className="btn-nav" onClick={() => navigate(backUrl, { replace: true })} aria-label={parentChunkId != null ? 'Back to parent chunk' : 'Back to project'}>
          ← BACK
        </button>
      </div>
      <div className="card chunk-editor-card">
      <header className="chunk-editor-header">
        <h1>Chunk{rangeStr ? ` (records ${rangeStr})` : ''}</h1>
        <div className="chunk-editor-meta">
          {chunkTag?.trim() && (
            <span>Tag: <strong>{chunkTag.trim()}</strong></span>
          )}
          {name?.trim() && (
            <span className="chunk-editor-assignee" title="Edit your name">
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
                  if (e.key === 'Enter') e.target.blur();
                }}
                disabled={nameSaving}
                aria-label="Assignee name"
                className="name-input-editable"
                style={{
                  width: `${Math.max(6, Math.min((name?.length ?? 0) + 2, 42))}ch`,
                  minWidth: '4rem',
                  maxWidth: '24rem',
                  padding: '0.2rem 0.4rem', fontSize: '0.9rem', fontWeight: 600,
                  border: '1px solid transparent', borderRadius: 4, background: 'transparent', color: 'inherit',
                }}
              />
            </span>
          )}
        </div>
        {data.totalInChunk > 0 && (
          <div className="chunk-editor-progress" aria-label={`${data.labeledInChunk ?? 0} of ${data.totalInChunk} labeled`}>
            <div className="chunk-editor-progress-label-wrap" style={{ textAlign: 'right' }}>
              <span className="chunk-editor-progress-text">{data.labeledInChunk ?? 0} of {data.totalInChunk} labeled</span>
            </div>
            <div className="chunk-editor-progress-bar" role="progressbar" aria-valuenow={data.labeledInChunk ?? 0} aria-valuemin={0} aria-valuemax={data.totalInChunk}>
              <div className="chunk-editor-progress-fill" style={{ width: `${Math.min(100, ((data.labeledInChunk ?? 0) / data.totalInChunk) * 100)}%` }} />
            </div>
          </div>
        )}
      </header>
      {error && <p className="chunk-editor-error" role="alert">{error}</p>}
      {successMessage && <p className="form-success-message" role="status">{successMessage}</p>}
      {loading && data.rows.length === 0 ? (
        <p className="chunk-editor-loading">Loading...</p>
      ) : (
        <>
          <div className="chunk-editor-data-section">
            {data.rows?.map((row) => (
              <div key={row.rowIndex} className="card card-row">
                <div className="chunk-editor-data-card">
                  <div className="chunk-editor-data-side">
                    <h3>Record {row.rowIndex + 1}</h3>
                    <ul>
                      {Object.entries(row.leftValues || {}).map(([k, v], idx, arr) => (
                        <li key={k}>
                          <strong>{k}:</strong>{' '}
                          <span style={{ whiteSpace: 'pre-wrap' }}>{renderConversation(v)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="chunk-editor-labels-side">
                    <h3>Labels</h3>
                    <div className="chunk-editor-labels-actions">
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
                              setUserSelectedRowOffsets((prev) => new Set(prev).add(row.rowOffsetInChunk));
                              if (opt !== row.targetCurrentValue) {
                                setData((prev) => ({
                                  ...prev,
                                  rows: prev.rows.map((r) =>
                                    r.rowOffsetInChunk === row.rowOffsetInChunk ? { ...r, targetCurrentValue: opt } : r
                                  ),
                                }));
                                setTimeout(() => handleSetValue(row.rowOffsetInChunk, opt), 100);
                              } else if (autoAdvance && data.rows.length === 1 && offset + 1 < data.totalInChunk) {
                                fetch(`/api/sessions/${id}/chunks/${chunkId}/rows-viewed`, {
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
          <div className="chunk-editor-nav-group">
            <div className="chunk-editor-nav-row">
              <div className="chunk-editor-row-nav chunk-editor-row-nav-inline">
                <span>Record</span>
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
                  aria-label="Go to record number"
                />
                <span>of {rangeStr}</span>
              </div>
              <div className="chunk-editor-nav-buttons">
                <button type="button" className="btn-nav chunk-editor-nav-prev-next" onClick={goPrev} disabled={offset === 0} aria-label="Previous record">
                  ← Previous
                </button>
                {(() => {
                  if (typeof sessionStorage === 'undefined' || !data.totalInChunk) return null;
                  const v = sessionStorage.getItem(LAST_UPDATED_ROW_KEY(id, chunkId));
                  const rowOff = v != null ? parseInt(v, 10) : NaN;
                  if (Number.isNaN(rowOff) || rowOff < 0 || rowOff >= data.totalInChunk) return null;
                  const displayRow = data.chunkStartRow != null ? data.chunkStartRow + rowOff + 1 : rowOff + 1;
                  return (
                    <button
                      type="button"
                      className="btn-nav chunk-editor-nav-last-updated"
                      title={`Last updated (record ${displayRow})`}
                      onClick={() => {
                        setOffset(rowOff);
                        loadRows(rowOff, limit);
                        setGoToRowInput('');
                        if (typeof window !== 'undefined') window.scrollTo(0, 0);
                      }}
                    >
                      Last updated (record {displayRow})
                    </button>
                  );
                })()}
                <button type="button" className="btn-nav chunk-editor-nav-prev-next" onClick={goNext} disabled={offset + limit >= data.totalInChunk} aria-label="Next record">
                  Next →
                </button>
              </div>
              <span className="chunk-editor-shortcut-hint" aria-hidden="true">← → move, 1–{Math.min(9, (data.targetOptions?.length || 0))} label</span>
            </div>
          </div>
          <div className="chunk-editor-settings-bottom">
            <div className="chunk-editor-toolbar">
              <label>
                Records per view:{' '}
                <select
                  value={limit}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setLimit(val);
                    setOffset(0);
                    loadRows(0, val);
                    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(ROWS_PER_VIEW_KEY, String(val));
                  }}
                  aria-label="Records per view"
                >
                  {[1, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={autoAdvance}
                  disabled={limit !== 1}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setAutoAdvance(checked);
                    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(AUTO_ADVANCE_KEY, checked ? 'true' : 'false');
                  }}
                />
                {' '}Auto-advance after saving{limit === 1 ? ' (next record)' : ''}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={soundOnSelect}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setSoundOnSelect(checked);
                    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(SOUND_ON_SELECT_KEY, checked ? 'true' : 'false');
                  }}
                />
                {' '}Play sound on selection
              </label>
            </div>
            <button type="button" className="btn-success chunk-editor-complete-btn" onClick={handleComplete}>
              Mark chunk as completed
            </button>
          </div>
        </>
      )}
      </div>
      {!loading && data.rows.length > 0 && (
        <details className="card chunk-editor-shortcuts-card" role="region" aria-label="Keyboard shortcuts">
          <summary className="chunk-editor-shortcuts-summary">⌨️ Keyboard shortcuts</summary>
          <ul className="chunk-editor-shortcuts-list">
            <li><kbd>←</kbd> <kbd>→</kbd> Move between records (previous / next).</li>
            <li><kbd>1</kbd>–<kbd>9</kbd> Apply the corresponding label (1 = first option, 2 = second, etc.).</li>
            <li>Records <strong>auto-advance</strong> after you select a label by default; turn this off in the settings below.</li>
            <li>View more records at once: change <strong>Records per view</strong> in the settings below.</li>
          </ul>
        </details>
      )}
      {rechunkError && <p className="chunk-editor-error" role="alert">{rechunkError}</p>}
      <ChunkingWidget
        totalRecords={data.totalInChunk}
        recordRangeLabel={rangeStr ? `records ${rangeStr}` : undefined}
        title="Re-chunk"
        description="Split this chunk into smaller sub-chunks. You will be taken to the new sub-chunks after splitting."
        confirmStep
        submitLabel="Split"
        onSubmit={handleRechunkSubmit}
        collapsible
        triggerLabel="Split this chunk"
        submitting={rechunkSubmitting}
      />
    </>
  );
}
