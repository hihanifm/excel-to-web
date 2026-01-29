import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const STEPS = ['Upload', 'Choose sheet', 'Choose columns', 'Configure options'];

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

export default function SessionCreate() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [sessionId, setSessionId] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [chunkSize, setChunkSize] = useState(100);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [headers, setHeaders] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [leftColumns, setLeftColumns] = useState([]);
  const [targetColumn, setTargetColumn] = useState('');
  const [targetColumnIsNew, setTargetColumnIsNew] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [targetOptions, setTargetOptions] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Upload
  const handleUpload = (e) => {
    e.preventDefault();
    setError('');
    const form = e.target;
    const fd = new FormData(form);
    if (!fd.get('file')) {
      setError('Select a file');
      return;
    }
    setLoading(true);
    fetch('/api/sessions/upload', { method: 'POST', body: fd })
      .then(parseJsonResponse)
      .then((data) => {
        setSessionId(data.sessionId);
        setSheetNames(data.sheetNames || []);
        setChunkSize(parseInt(form.chunkSize?.value || '100', 10));
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
      body: JSON.stringify({ sheetName: selectedSheet, chunkSize }),
    })
      .then(parseJsonResponse)
      .then((data) => {
        setHeaders(data.headers || []);
        setTotalRows(data.totalRows || 0);
        setStep(3);
      })
      .catch((err) => setError(err.message || 'Failed'))
      .finally(() => setLoading(false));
  };

  // Step 3: Choose columns
  const handleSaveColumns = (e) => {
    e.preventDefault();
    const target = targetColumnIsNew ? newColumnName : targetColumn;
    if (!target) {
      setError('Select or enter target column');
      return;
    }
    if (leftColumns.length === 0) setError('Select at least one left column');
    setLoading(true);
    setError('');
    fetch(`/api/sessions/${sessionId}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leftColumns,
        targetColumn: target,
        targetColumnIsNew,
      }),
    })
      .then(parseJsonResponse)
      .then(() => setStep(4))
      .catch((err) => setError(err.message || 'Failed'))
      .finally(() => setLoading(false));
  };

  const toggleLeftColumn = (col) => {
    setLeftColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  // Step 4: Configure options
  const [prefillColumn, setPrefillColumn] = useState('');
  const handlePreFill = () => {
    const col = prefillColumn || (targetColumnIsNew ? null : targetColumn);
    if (!col) return;
    fetch(`/api/sessions/${sessionId}/columns/${encodeURIComponent(col)}/unique`)
      .then(parseJsonResponse)
      .then((data) => setTargetOptions((data.values || []).join('\n')))
      .catch(console.error);
  };

  const handleSaveOptions = (e) => {
    e.preventDefault();
    const options = targetOptions
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (options.length === 0) {
      setError('Enter at least one option');
      return;
    }
    setLoading(true);
    setError('');
    fetch(`/api/sessions/${sessionId}/config/options`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetOptions: options, referenceColumn: prefillColumn || null }),
    })
      .then(parseJsonResponse)
      .then(() => navigate(`/sessions/${sessionId}`))
      .catch((err) => setError(err.message || 'Failed'))
      .finally(() => setLoading(false));
  };

  return (
    <div className="card">
      <h1>Create session</h1>
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
          <p>Upload an Excel file. Chunk size = number of rows per chunk.</p>
          <p>
            <input type="file" name="file" accept=".xlsx,.xls" required />
          </p>
          <p>
            <label>Chunk size: </label>
            <input type="number" name="chunkSize" min={1} max={1000} defaultValue={100} />
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
        <form onSubmit={handleSaveColumns}>
          <p>Select columns for the left panel (read-only) and one target column.</p>
          <p><strong>Left panel columns (select one or more):</strong></p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
            {headers.map((col) => (
              <label key={col} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <input
                  type="checkbox"
                  checked={leftColumns.includes(col)}
                  onChange={() => toggleLeftColumn(col)}
                />
                {col}
              </label>
            ))}
          </div>
          <p><strong>Target column (one):</strong></p>
          <label>
            <input
              type="radio"
              checked={!targetColumnIsNew}
              onChange={() => setTargetColumnIsNew(false)}
            />
            Existing column:
          </label>
          <select
            value={targetColumn}
            onChange={(e) => setTargetColumn(e.target.value)}
            disabled={targetColumnIsNew}
            style={{ marginLeft: '1rem' }}
          >
            <option value="">-- Select --</option>
            {headers.map((col) => (
              <option key={col} value={col}>{col}</option>
            ))}
          </select>
          <br />
          <label style={{ display: 'block', marginTop: '0.5rem' }}>
            <input
              type="radio"
              checked={targetColumnIsNew}
              onChange={() => setTargetColumnIsNew(true)}
            />
            New column:
          </label>
          <input
            type="text"
            value={newColumnName}
            onChange={(e) => setNewColumnName(e.target.value)}
            placeholder="Column name"
            disabled={!targetColumnIsNew}
            style={{ marginLeft: '1rem' }}
          />
          <p style={{ marginTop: '1rem' }}>
            <button type="submit" className="primary" disabled={loading}>
              {loading ? 'Saving...' : 'Continue'}
            </button>
          </p>
        </form>
      )}

      {step === 4 && (
        <form onSubmit={handleSaveOptions}>
          <p>Configure the options shown as buttons for the target column. One per line or comma-separated.</p>
          <p>
            Pre-fill options from column:{' '}
            <select value={prefillColumn} onChange={(e) => setPrefillColumn(e.target.value)}>
              <option value="">-- Select column --</option>
              {headers.map((col) => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
            {' '}
            <button type="button" onClick={handlePreFill}>Pre-fill</button>
          </p>
          <textarea
            value={targetOptions}
            onChange={(e) => setTargetOptions(e.target.value)}
            placeholder="Option 1&#10;Option 2&#10;Option 3"
            rows={8}
            style={{ width: '100%', marginBottom: '1rem' }}
          />
          <button type="submit" className="primary" disabled={loading}>
            {loading ? 'Saving...' : 'Finish and open session'}
          </button>
        </form>
      )}
    </div>
  );
}
