import { useState } from 'react';

const STEPS = ['Upload', 'Choose sheet', 'Choose columns'];

/** Parse response as JSON; throw with a clear message if HTML or error. */
async function parseJsonResponse(r) {
  const text = await r.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    const msg = text.startsWith('<') ? `Server returned an error (${r.status}). Check that the API is running.` : (text.slice(0, 150) || r.statusText || 'Request failed');
    throw new Error(msg);
  }
  if (!r.ok) throw new Error(data.error || data.message || `Request failed (${r.status})`);
  return data;
}

export default function Compare() {
  const [step, setStep] = useState(1);
  const [sessionId, setSessionId] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [sessionName, setSessionName] = useState('');
  const [selectedSheet, setSelectedSheet] = useState('');
  const [headers, setHeaders] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [col1, setCol1] = useState('');
  const [col2, setCol2] = useState('');
  const [compareResult, setCompareResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Upload
  const handleUpload = (e) => {
    e.preventDefault();
    setError('');
    const form = e.target;
    const fd = new FormData(form);
    if (sessionName.trim()) fd.set('name', sessionName.trim());
    if (!fd.get('file')) {
      setError('Select a file');
      return;
    }
    setLoading(true);
    fetch('/api/sessions/upload', { method: 'POST', body: fd })
      .then(parseJsonResponse)
      .then((data) => {
        const names = data.sheetNames || [];
        setSessionId(data.sessionId);
        setSheetNames(names);
        setSelectedSheet(names[0] || '');
        setStep(2);
      })
      .catch((err) => setError(err.message || 'Upload failed'))
      .finally(() => setLoading(false));
  };

  // Step 2: Choose sheet
  const handleChooseSheet = (e) => {
    e.preventDefault();
    if (!selectedSheet) {
      setError('Select a sheet');
      return;
    }
    setLoading(true);
    setError('');
    fetch(`/api/sessions/${sessionId}/sheet`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetName: selectedSheet, compare: true }),
    })
      .then(parseJsonResponse)
      .then((data) => {
        setHeaders(data.headers || []);
        setTotalRows(data.totalRows || 0);
        setCol1(data.headers?.[0] || '');
        setCol2(data.headers?.[1] || '');
        setCompareResult(null);
        setStep(3);
      })
      .catch((err) => setError(err.message || 'Failed'))
      .finally(() => setLoading(false));
  };

  // Step 3: Choose 2 columns and compare
  const handleCompare = (e) => {
    e.preventDefault();
    if (!col1 || !col2) {
      setError('Select both columns');
      return;
    }
    if (col1 === col2) {
      setError('Select two different columns');
      return;
    }
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ col1, col2 });
    fetch(`/api/sessions/${sessionId}/compare?${params}`)
      .then(parseJsonResponse)
      .then((data) => setCompareResult(data))
      .catch((err) => setError(err.message || 'Failed'))
      .finally(() => setLoading(false));
  };

  return (
    <div className="card">
      <h1>Compare</h1>
      <div className="wizard-steps">
        {STEPS.map((label, i) => (
          <span
            key={label}
            className={step > i + 1 ? 'done' : step === i + 1 ? 'active' : ''}
          >
            {i + 1}. {label}
          </span>
        ))}
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {step === 1 && (
        <form onSubmit={handleUpload}>
          <p>Upload an Excel file to compare two columns.</p>
          <p>
            <label>Document name (optional): </label>
            <input
              type="text"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="e.g. Q1 data"
              style={{ minWidth: '12rem' }}
            />
          </p>
          <p>
            <input type="file" name="file" accept=".xlsx,.xls" required />
          </p>
          <button type="submit" className="primary" disabled={loading}>
            {loading ? 'Uploading...' : 'Upload'}
          </button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleChooseSheet}>
          <p>Choose a sheet to use.</p>
          <select value={selectedSheet} onChange={(e) => setSelectedSheet(e.target.value)}>
            <option value="">-- Select sheet --</option>
            {sheetNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <p style={{ marginTop: '1rem' }}>
            <button type="submit" className="primary" disabled={loading}>
              {loading ? 'Loading...' : 'Continue'}
            </button>
          </p>
        </form>
      )}

      {step === 3 && (
        <>
          <form onSubmit={handleCompare}>
            <p>Choose two columns to compare.</p>
            <p>
              <label>Column 1: </label>
              <select value={col1} onChange={(e) => setCol1(e.target.value)}>
                <option value="">-- Select --</option>
                {headers.map((col) => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </p>
            <p>
              <label>Column 2: </label>
              <select value={col2} onChange={(e) => setCol2(e.target.value)}>
                <option value="">-- Select --</option>
                {headers.map((col) => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </p>
            <button type="submit" className="primary" disabled={loading}>
              {loading ? 'Comparing...' : 'Compare'}
            </button>
          </form>

          {compareResult && (
            <div style={{ marginTop: '2rem' }}>
              <h2>Results</h2>
              {compareResult.totalRows !== undefined && (
                <>
                  <p>
                    Total rows: {compareResult.totalRows}
                    {compareResult.sameCount !== undefined && (
                      <> — Same: {compareResult.sameCount} ({compareResult.samePct}%) · Different: {compareResult.differentCount} ({compareResult.differentPct}%)</>
                    )}
                  </p>
                  <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '-0.25rem' }}>
                    Same = rows where both columns match; table shows distribution per column.
                  </p>
                </>
              )}
              <table className="compare-table" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #cbd5e1' }}>Value</th>
                    <th style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '2px solid #cbd5e1' }}>{col1}</th>
                    <th style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '2px solid #cbd5e1' }}>{col2}</th>
                    <th style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '2px solid #cbd5e1' }}>% change</th>
                  </tr>
                </thead>
                <tbody>
                  {(compareResult.valueStats || []).map((row) => (
                    <tr key={row.value}>
                      <td style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>{row.value}</td>
                      <td style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>
                        {row.col1Pct}% ({row.col1Count})
                      </td>
                      <td style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>
                        {row.col2Pct}% ({row.col2Count})
                      </td>
                      <td style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>
                        {(() => {
                          const c1 = row.col1Count ?? 0;
                          const c2 = row.col2Count ?? 0;
                          if (c1 === 0 && c2 > 0) return 'new';
                          if (c1 === 0) return '—';
                          const pct = Math.round(((c2 - c1) / c1) * 1000) / 10;
                          return (pct >= 0 ? '+' : '') + pct + '%';
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
