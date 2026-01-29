import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function ChunkEditor() {
  const { id, chunkIndex } = useParams();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [claimed, setClaimed] = useState(false);
  const [limit, setLimit] = useState(1);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState({ rows: [], totalInChunk: 0, targetOptions: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  useEffect(() => {
    if (claimed) loadRows(offset, limit);
  }, [id, chunkIndex, claimed, offset, limit]);

  const handleClaim = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Enter your name');
      return;
    }
    setLoading(true);
    setError('');
    fetch(`/api/sessions/${id}/chunks/${chunkIndex}/claim`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((d) => { throw new Error(d.error || 'Claim failed'); });
        setClaimed(true);
        setOffset(0);
        loadRows(0, limit);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  const handleSetValue = (rowOffsetInChunk, targetValue) => {
    fetch(`/api/sessions/${id}/chunks/${chunkIndex}/row/${rowOffsetInChunk}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), targetValue }),
    })
      .then((r) => {
        if (!r.ok) throw new Error('Save failed');
        const nextOffset = rowOffsetInChunk + 1;
        if (nextOffset >= data.totalInChunk) {
          loadRows(offset, limit);
        } else if (data.rows.length === 1) {
          loadRows(offset + 1, limit);
          setOffset((o) => o + 1);
        } else {
          const idx = data.rows.findIndex((r) => r.rowOffsetInChunk === rowOffsetInChunk);
          if (idx >= 0 && idx < data.rows.length) {
            setData((prev) => ({
              ...prev,
              rows: prev.rows.map((r, i) =>
                i === idx ? { ...r, targetCurrentValue: targetValue } : r
              ),
            }));
          }
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
      </p>
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
                          onClick={() => handleSetValue(row.rowOffsetInChunk, opt)}
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
