import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const CLAIMANT_STORAGE_KEY = (sessionId) => `excel-app_claimant_${sessionId}`;

export default function ChunkEditor() {
  const { id, chunkIndex } = useParams();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [claimed, setClaimed] = useState(false);
  const [limit, setLimit] = useState(1);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState({ rows: [], totalInChunk: 0, targetOptions: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resumeChecked, setResumeChecked] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [justAdvanced, setJustAdvanced] = useState(false);

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

  // On mount: if chunk is already claimed by the same user (stored name), skip claim form and resume from last edited row
  useEffect(() => {
    if (resumeChecked || claimed) return;
    const storedName = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(CLAIMANT_STORAGE_KEY(id)) : null;
    if (!storedName?.trim()) {
      setResumeChecked(true);
      return;
    }
    fetch(`/api/sessions/${id}/chunks`)
      .then((r) => r.ok ? r.json() : [])
      .then((chunks) => {
        const chunk = chunks.find((c) => String(c.chunk_index) === String(chunkIndex));
        if (!chunk || chunk.assignee_name !== storedName.trim()) {
          setResumeChecked(true);
          return;
        }
        setName(storedName.trim());
        setClaimed(true);
        const nextRow = chunk.rowsEditedInChunk ?? 0;
        const totalInChunk = chunk.rowsInChunk ?? chunk.end_row - chunk.start_row;
        setOffset(Math.min(nextRow, Math.max(0, totalInChunk - 1)));
        setResumeChecked(true);
      })
      .catch(() => setResumeChecked(true));
  }, [id, chunkIndex, claimed, resumeChecked]);

  useEffect(() => {
    if (claimed) loadRows(offset, limit);
  }, [id, chunkIndex, claimed, offset, limit]);

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
          setJustAdvanced(true);
          const t = setTimeout(() => setJustAdvanced(false), 2500);
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

  const goPrev = () => setOffset((o) => Math.max(0, o - limit));
  const goNext = () => setOffset((o) => Math.min(data.totalInChunk - limit, o + limit));

  if (!claimed) {
    const storedName = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(CLAIMANT_STORAGE_KEY(id)) : null;
    if (!resumeChecked && storedName?.trim()) {
      return (
        <div className="card">
          <h1>Chunk {Number(chunkIndex) + 1}</h1>
          <p><button type="button" onClick={() => navigate(`/sessions/${id}`)}>← Back to session</button></p>
          <p>Resuming...</p>
        </div>
      );
    }
    return (
      <div className="card">
        <h1>Chunk {Number(chunkIndex) + 1}</h1>
        <p><button type="button" onClick={() => navigate(`/sessions/${id}`)}>← Back to session</button></p>
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
      <h1>Chunk {Number(chunkIndex) + 1}</h1>
      <p>
        <button type="button" onClick={() => navigate(`/sessions/${id}`)}>← Back to session</button>
      </p>
      <p>
        Rows per view:{' '}
        <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setOffset(0); loadRows(0, Number(e.target.value)); }}>
          {[1, 5, 10].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        {' '}
        <label style={{ marginLeft: '1rem' }}>
          <input type="checkbox" checked={autoAdvance} onChange={(e) => setAutoAdvance(e.target.checked)} />
          {' '}Auto-advance after saving {limit === 1 ? '(next row)' : ''}
        </label>
      </p>
      {justAdvanced && (
        <p style={{ background: '#e3f2fd', padding: '0.5rem 0.75rem', borderRadius: 6 }}>
          → Moved to next row
        </p>
      )}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {loading && data.rows.length === 0 ? (
        <p>Loading...</p>
      ) : (
        <>
          <p>
            Rows {offset + 1}–{Math.min(offset + limit, data.totalInChunk)} of {data.totalInChunk}
            {' '}
            <button type="button" onClick={goPrev} disabled={offset === 0}>Previous</button>
            {' '}
            <button type="button" onClick={goNext} disabled={offset + limit >= data.totalInChunk}>Next</button>
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            {data.rows?.map((row) => (
              <div key={row.rowIndex} className="card" style={{ flex: '1 1 280px', maxWidth: '100%' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <strong>Left (read-only)</strong>
                    <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0' }}>
                      {Object.entries(row.leftValues || {}).map(([k, v]) => (
                        <li key={k}><strong>{k}:</strong> {v ?? ''}</li>
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
                            if (opt !== row.targetCurrentValue) handleSetValue(row.rowOffsetInChunk, opt);
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
          <p style={{ marginTop: '1rem' }}>
            <button type="button" className="primary" onClick={handleComplete}>
              Mark chunk as completed
            </button>
          </p>
        </>
      )}
    </div>
  );
}
