import { useState, useEffect, useRef } from 'react';
import { useNavigate, useBlocker } from 'react-router-dom';

const STEPS = ['Upload', 'Choose sheet', 'Chunking', 'Choose columns', 'Configure options'];

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
  const [sessionName, setSessionName] = useState('');
  const [creatorName, setCreatorName] = useState('');
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
  const [fileSource, setFileSource] = useState('upload');
  const [preloadedFiles, setPreloadedFiles] = useState([]);
  const [selectedPreloadedPath, setSelectedPreloadedPath] = useState('');
  const [refreshingPreloaded, setRefreshingPreloaded] = useState(false);
  const [deletePin, setDeletePin] = useState('');
  const handledBlockRef = useRef(false);
  const leaveViaCancelRef = useRef(false);
  const navigatingToSuccessRef = useRef(false);

  const hasCreateInProgress =
    step >= 2 ||
    (step === 1 && (sessionName.trim() || creatorName.trim() || deletePin.trim() || selectedPreloadedPath));
  const blocker = useBlocker(hasCreateInProgress);

  useEffect(() => {
    if (blocker.state !== 'blocked') {
      handledBlockRef.current = false;
      return;
    }
    if (navigatingToSuccessRef.current) {
      navigatingToSuccessRef.current = false;
      blocker.proceed();
      return;
    }
    if (leaveViaCancelRef.current) {
      leaveViaCancelRef.current = false;
      blocker.proceed();
      return;
    }
    if (handledBlockRef.current) return;
    handledBlockRef.current = true;
    const message = sessionId
      ? 'Discard and delete this draft session?'
      : 'Leave? Your progress will be lost.';
    const ok = window.confirm(message);
    if (ok) {
      if (sessionId) {
        fetch(`/api/sessions/${sessionId}/abandon`, { method: 'DELETE' })
          .then((r) => {
            if (!r.ok) return r.json().then((d) => { throw new Error(d.error || 'Abandon failed'); });
            return r.json();
          })
          .then(() => blocker.proceed())
          .catch(() => {
            handledBlockRef.current = false;
            blocker.reset();
          });
      } else {
        blocker.proceed();
      }
    } else {
      blocker.reset();
    }
  }, [blocker.state, sessionId, blocker]);

  useEffect(() => {
    if (!hasCreateInProgress) return;
    const onBeforeUnload = (e) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasCreateInProgress]);

  const fetchPreloadedFiles = () => {
    setRefreshingPreloaded(true);
    fetch('/api/sessions/preloaded-files')
      .then(parseJsonResponse)
      .then((data) => setPreloadedFiles(data.files || []))
      .catch(() => setPreloadedFiles([]))
      .finally(() => setRefreshingPreloaded(false));
  };

  useEffect(() => {
    if (fileSource !== 'preloaded') return;
    fetchPreloadedFiles();
  }, [fileSource]);

  const applyStep1Success = (data) => {
    const names = data.sheetNames || [];
    setSessionId(data.sessionId);
    setSheetNames(names);
    setSelectedSheet(names[0] || '');
    setStep(2);
  };

  // Step 1: Upload or choose preloaded
  const handleStep1Submit = (e) => {
    e.preventDefault();
    setError('');
    if (fileSource === 'upload') {
      const form = e.target;
      const fd = new FormData(form);
      if (sessionName.trim()) fd.set('name', sessionName.trim());
      if (creatorName.trim()) fd.set('creator_name', creatorName.trim());
      if (deletePin.trim()) fd.set('delete_pin', deletePin.trim());
      if (!fd.get('file')) {
        setError('Select a file');
        return;
      }
      setLoading(true);
      fetch('/api/sessions/upload', { method: 'POST', body: fd })
        .then(parseJsonResponse)
        .then(applyStep1Success)
        .catch((err) => setError(err.message || 'Upload failed'))
        .finally(() => setLoading(false));
    } else {
      if (!selectedPreloadedPath) {
        setError('Select a preloaded file');
        return;
      }
      setLoading(true);
      fetch('/api/sessions/from-preloaded', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preloadedPath: selectedPreloadedPath,
          name: sessionName.trim() || undefined,
          creator_name: creatorName.trim() || undefined,
          delete_pin: deletePin.trim() || undefined,
        }),
      })
        .then(parseJsonResponse)
        .then(applyStep1Success)
        .catch((err) => setError(err.message || 'Failed to use preloaded file'))
        .finally(() => setLoading(false));
    }
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
      body: JSON.stringify({ sheetName: selectedSheet }),
    })
      .then(parseJsonResponse)
      .then((data) => {
        const rows = data.totalRows || 0;
        setHeaders(data.headers || []);
        setTotalRows(rows);
        setChunkRangeStart(1);
        setChunkRangeEnd(rows);
        setEqualSize(Math.max(1, Math.round(rows / 50) * 10));
        setStep(3);
      })
      .catch((err) => setError(err.message || 'Failed'))
      .finally(() => setLoading(false));
  };

  const [chunkRangeStart, setChunkRangeStart] = useState(1);
  const [chunkRangeEnd, setChunkRangeEnd] = useState(0);
  const [sizeMode, setSizeMode] = useState('equal');
  const [equalSize, setEqualSize] = useState(100);
  const [chunkSizesText, setChunkSizesText] = useState('');

  const handleChunking = (e) => {
    e.preventDefault();
    const from = Number(chunkRangeStart) || 1;
    const to = Number(chunkRangeEnd) || totalRows;
    if (from < 1 || to > totalRows || from > to) {
      setError(`Range must be from 1 to ${totalRows}, and from ≤ to (records)`);
      return;
    }
    const rangeLength = to - from + 1;
    let chunkSizes = [];
    if (sizeMode === 'equal') {
      const size = Math.min(Math.max(1, parseInt(equalSize, 10)), 10000);
      if (size > rangeLength) {
        setError(`Chunk size ${size} exceeds range length ${rangeLength}`);
        return;
      }
      chunkSizes = [size];
    } else {
      chunkSizes = chunkSizesText
        .split(/[\s,]+/)
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !Number.isNaN(n) && n > 0);
      if (chunkSizes.length === 0) {
        setError('Enter at least one chunk size (comma-separated numbers)');
        return;
      }
      for (const s of chunkSizes) {
        if (s > rangeLength) {
          setError(`Chunk size ${s} exceeds range length ${rangeLength}`);
          return;
        }
      }
      const sum = chunkSizes.reduce((a, b) => a + b, 0);
      if (sum > rangeLength) {
        setError(`Sum of chunk sizes (${sum}) exceeds chosen records (${rangeLength})`);
        return;
      }
    }
    setLoading(true);
    setError('');
    fetch(`/api/sessions/${sessionId}/chunking`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        sizeMode === 'equal'
          ? { chunkRange: { start: from, end: to }, equalSize: chunkSizes[0] }
          : { chunkRange: { start: from, end: to }, chunkSizes }
      ),
    })
      .then(parseJsonResponse)
      .then(() => setStep(4))
      .catch((err) => setError(err.message || 'Failed'))
      .finally(() => setLoading(false));
  };

  const rangeLength = Math.max(0, (Number(chunkRangeEnd) || totalRows) - (Number(chunkRangeStart) || 1) + 1);
  const customSizesSum = (() => {
    if (sizeMode !== 'custom' || !chunkSizesText.trim()) return 0;
    const sizes = chunkSizesText
      .split(/[\s,]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n) && n > 0);
    return sizes.reduce((a, b) => a + b, 0);
  })();
  const customSumExceedsRange = rangeLength > 0 && customSizesSum > rangeLength;
  const lastChunkRemainder = (() => {
    if (rangeLength <= 0) return 0;
    if (sizeMode === 'equal') {
      const size = Math.min(Math.max(1, parseInt(equalSize, 10)), 10000);
      if (size > rangeLength) return rangeLength;
      const remainder = rangeLength % size;
      return remainder === 0 ? size : remainder;
    }
    const sizes = chunkSizesText
      .split(/[\s,]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n) && n > 0);
    if (sizes.length === 0) return rangeLength;
    let cursor = 0;
    let idx = 0;
    while (cursor < rangeLength && cursor + sizes[idx % sizes.length] <= rangeLength) {
      cursor += sizes[idx % sizes.length];
      idx += 1;
    }
    return rangeLength - cursor;
  })();

  // Step 4: Choose columns
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
      .then(() => setStep(5))
      .catch((err) => setError(err.message || 'Failed'))
      .finally(() => setLoading(false));
  };

  const toggleLeftColumn = (col) => {
    setLeftColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  // Step 5: Configure options
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
      body: JSON.stringify({ targetOptions: options }),
    })
      .then(parseJsonResponse)
      .then(() => {
        navigatingToSuccessRef.current = true;
        navigate(`/sessions/${sessionId}`);
      })
      .catch((err) => setError(err.message || 'Failed'))
      .finally(() => setLoading(false));
  };

  const handleCancel = () => {
    if (step === 1) {
      navigate('/');
      return;
    }
    if (!window.confirm('Discard and delete this draft session?')) return;
    leaveViaCancelRef.current = true;
    setLoading(true);
    setError('');
    fetch(`/api/sessions/${sessionId}/abandon`, { method: 'DELETE' })
      .then((r) => {
        if (!r.ok) return r.json().then((d) => { throw new Error(d.error || 'Abandon failed'); });
        return r.json();
      })
      .then(() => navigate('/'))
      .catch((err) => {
        leaveViaCancelRef.current = false;
        setError(err.message);
      })
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
        <form onSubmit={handleStep1Submit} className="form-fields">
          <div className="form-field">
            <label htmlFor="session-name">Session name (optional):</label>
            <input
              id="session-name"
              type="text"
              className="form-input"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="e.g. Q1 review"
            />
          </div>
          <div className="form-field">
            <label htmlFor="creator-name">Creator name (optional):</label>
            <input
              id="creator-name"
              type="text"
              className="form-input"
              value={creatorName}
              onChange={(e) => setCreatorName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <div className="form-field">
            <label htmlFor="delete-pin">Delete PIN (optional):</label>
            <input
              id="delete-pin"
              type="password"
              className="form-input"
              value={deletePin}
              onChange={(e) => setDeletePin(e.target.value)}
              placeholder="Required to delete this session later"
              autoComplete="off"
            />
          </div>

          <div className="form-section">
            <p className="form-section-title">Choose an Excel file to use.</p>
            <div className="form-field">
              <label className="form-field-spacer" />
              <div className="form-radio-group">
                <label>
                  <input
                    type="radio"
                    name="fileSource"
                    checked={fileSource === 'upload'}
                    onChange={() => setFileSource('upload')}
                  />
                  Upload file
                </label>
                <label>
                  <input
                    type="radio"
                    name="fileSource"
                    checked={fileSource === 'preloaded'}
                    onChange={() => setFileSource('preloaded')}
                  />
                  Choose from preloaded
                </label>
              </div>
            </div>
            {fileSource === 'upload' && (
              <div className="form-field">
                <label className="form-field-spacer" />
                <div className="form-input">
                  <input type="file" name="file" accept=".xlsx,.xls" required />
                </div>
              </div>
            )}
            {fileSource === 'preloaded' && (
              <div className="form-field">
                <label htmlFor="preloaded-file">Preloaded file:</label>
                <div className="form-input" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    id="preloaded-file"
                    value={selectedPreloadedPath}
                    onChange={(e) => setSelectedPreloadedPath(e.target.value)}
                    style={{ flex: '1 1 12rem', minWidth: '12rem' }}
                  >
                    <option value="">-- Select file --</option>
                    {preloadedFiles.map((f) => (
                      <option key={f.path} value={f.path}>{f.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={fetchPreloadedFiles}
                    disabled={refreshingPreloaded}
                  >
                    {refreshingPreloaded ? 'Refreshing...' : 'Refresh'}
                  </button>
                  {preloadedFiles.length === 0 && !refreshingPreloaded && (
                    <span style={{ color: '#64748b', fontSize: '0.9rem' }}>No preloaded files</span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="form-field form-actions">
            <span className="form-field-spacer" />
            <div className="form-actions-buttons">
              <button type="submit" className="primary" disabled={loading || (fileSource === 'preloaded' && refreshingPreloaded)}>
                {loading ? (fileSource === 'upload' ? 'Uploading...' : 'Loading...') : (fileSource === 'upload' ? 'Upload' : 'Continue')}
              </button>
              <button type="button" onClick={handleCancel} disabled={loading}>Cancel</button>
            </div>
          </div>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleChooseSheet} className="form-fields">
          <p className="form-info">Choose a sheet to use.</p>
          <div className="form-field">
            <label htmlFor="sheet-select">Sheet:</label>
            <select
              id="sheet-select"
              className="form-input"
              value={selectedSheet}
              onChange={(e) => setSelectedSheet(e.target.value)}
            >
              <option value="">-- Select sheet --</option>
              {sheetNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div className="form-field form-actions">
            <span className="form-field-spacer" />
            <div className="form-actions-buttons">
              <button type="submit" className="primary" disabled={loading}>
                {loading ? 'Loading...' : 'Continue'}
              </button>
              <button type="button" onClick={handleCancel} disabled={loading}>Cancel</button>
            </div>
          </div>
        </form>
      )}

      {step === 3 && (
        <form onSubmit={handleChunking} className="form-fields">
          <p className="form-info">Sheet has <strong>{totalRows}</strong> records.</p>
          <div className="form-field form-field-inline">
            <label htmlFor="from-row">From row:</label>
            <input
              id="from-row"
              type="number"
              min={1}
              max={totalRows}
              value={chunkRangeStart}
              onChange={(e) => setChunkRangeStart(e.target.value)}
              className="form-input-narrow"
            />
            <label htmlFor="to-row">To row:</label>
            <input
              id="to-row"
              type="number"
              min={1}
              max={totalRows}
              value={chunkRangeEnd}
              onChange={(e) => setChunkRangeEnd(e.target.value)}
              className="form-input-narrow"
            />
          </div>
          {rangeLength > 0 && (
            <p className="form-info"><strong>{rangeLength}</strong> records chosen.</p>
          )}

          <div className="form-section">
            <p className="form-section-title">Size:</p>
            <div className="form-field form-field-radio">
              <label className="form-radio-label">
                <input type="radio" checked={sizeMode === 'equal'} onChange={() => setSizeMode('equal')} />
                Equal: chunk size
              </label>
              <div className="form-input">
                <input
                  type="number"
                  min={1}
                  max={totalRows}
                  value={equalSize}
                  onChange={(e) => setEqualSize(e.target.value)}
                  className="form-input-narrow"
                />
              </div>
            </div>
            <div className="form-field form-field-radio">
              <label className="form-radio-label">
                <input type="radio" checked={sizeMode === 'custom'} onChange={() => setSizeMode('custom')} />
                Custom (comma-separated):
              </label>
              <div className="form-input">
                <input
                  type="text"
                  value={chunkSizesText}
                  onChange={(e) => setChunkSizesText(e.target.value)}
                  placeholder="150, 340, 120, 500"
                />
              </div>
            </div>
          </div>

          {customSumExceedsRange && (
            <div className="form-field">
              <span className="form-field-spacer" />
              <p className="form-info form-info-inline" style={{ color: '#dc2626' }}>Sum of chunk sizes ({customSizesSum}) exceeds chosen records ({rangeLength}).</p>
            </div>
          )}
          {rangeLength > 0 && !customSumExceedsRange && (
            <div className="form-field">
              <span className="form-field-spacer" />
              <p className="form-info form-info-inline">Last chunk will have remaining <strong>{lastChunkRemainder}</strong> records.</p>
            </div>
          )}

          <div className="form-field form-actions">
            <span className="form-field-spacer" />
            <div className="form-actions-buttons">
              <button type="submit" className="primary" disabled={loading || customSumExceedsRange}>
                {loading ? 'Saving...' : 'Continue'}
              </button>
              <button type="button" onClick={handleCancel} disabled={loading}>Cancel</button>
            </div>
          </div>
        </form>
      )}

      {step === 4 && (
        <form onSubmit={handleSaveColumns} className="form-fields">
          <p className="form-info">Select columns for the left panel (read-only) and one target column.</p>

          <div className="form-section">
            <p className="form-section-title">Left panel columns (select one or more):</p>
            <div className="form-checkbox-grid">
              {headers.map((col) => (
                <label key={col} className="form-checkbox-item">
                  <input
                    type="checkbox"
                    checked={leftColumns.includes(col)}
                    onChange={() => toggleLeftColumn(col)}
                  />
                  <span>{col}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="form-section">
            <p className="form-section-title">Target column (one):</p>
            <div className="form-field form-field-radio">
              <label className="form-radio-label">
                <input
                  type="radio"
                  checked={!targetColumnIsNew}
                  onChange={() => setTargetColumnIsNew(false)}
                />
                Existing column:
              </label>
              <div className="form-input">
                <select
                  value={targetColumn}
                  onChange={(e) => setTargetColumn(e.target.value)}
                  disabled={targetColumnIsNew}
                  style={{ width: '100%', maxWidth: '14rem' }}
                >
                  <option value="">-- Select --</option>
                  {headers.map((col) => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-field form-field-radio">
              <label className="form-radio-label">
                <input
                  type="radio"
                  checked={targetColumnIsNew}
                  onChange={() => setTargetColumnIsNew(true)}
                />
                New column:
              </label>
              <div className="form-input">
                <input
                  type="text"
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  placeholder="Column name"
                  disabled={!targetColumnIsNew}
                  style={{ width: '100%', maxWidth: '14rem' }}
                />
              </div>
            </div>
          </div>

          <div className="form-field form-actions">
            <span className="form-field-spacer" />
            <div className="form-actions-buttons">
              <button type="submit" className="primary" disabled={loading}>
                {loading ? 'Saving...' : 'Continue'}
              </button>
              <button type="button" onClick={handleCancel} disabled={loading}>Cancel</button>
            </div>
          </div>
        </form>
      )}

      {step === 5 && (
        <form onSubmit={handleSaveOptions}>
          <p>Configure the options shown as buttons for the target column. One per line or comma-separated.</p>
          <textarea
            value={targetOptions}
            onChange={(e) => setTargetOptions(e.target.value)}
            placeholder="Option 1&#10;Option 2&#10;Option 3"
            rows={8}
            style={{ width: '100%', marginBottom: '1rem' }}
          />
          <p style={{ marginTop: '1rem' }}>
            <button type="submit" className="primary" disabled={loading}>
              {loading ? 'Saving...' : 'Finish and open session'}
            </button>
            {' '}
            <button type="button" onClick={handleCancel} disabled={loading}>Cancel</button>
          </p>
        </form>
      )}
    </div>
  );
}
