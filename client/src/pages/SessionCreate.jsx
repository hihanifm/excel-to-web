import { useState, useEffect, useRef } from 'react';
import { useNavigate, useBlocker } from 'react-router-dom';
import ChunkingWidget from '../components/ChunkingWidget';

const STEPS = ['Upload', 'Choose sheet', 'Chunking', 'Choose columns', 'Configure label'];

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
  const [targetOptions, setTargetOptions] = useState('Approved, In Progress, Rejected');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState('');
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
      ? 'Discard and delete this draft project?'
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
    setFieldErrors({});
    if (!sessionName.trim()) {
      setFieldErrors({ sessionName: 'Enter a project name' });
      return;
    }
    if (fileSource === 'upload') {
      const form = e.target;
      const fd = new FormData(form);
      fd.set('name', sessionName.trim());
      if (creatorName.trim()) fd.set('creator_name', creatorName.trim());
      if (deletePin.trim()) fd.set('delete_pin', deletePin.trim());
      if (!fd.get('file')) {
        setFieldErrors({ file: 'Select a file' });
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
        setFieldErrors({ file: 'Select a preloaded file' });
        return;
      }
      setLoading(true);
      fetch('/api/sessions/from-preloaded', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preloadedPath: selectedPreloadedPath,
          name: sessionName.trim(),
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
    setFieldErrors({});
    if (!selectedSheet) {
      setFieldErrors({ sheet: 'Select a sheet' });
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
        const hdrs = data.headers || [];
        setHeaders(hdrs);
        setTotalRows(rows);
        setChunkRangeStart(1);
        setChunkRangeEnd(rows);
        setStep(3);
      })
      .catch((err) => setError(err.message || 'Failed'))
      .finally(() => setLoading(false));
  };

  const [chunkRangeStart, setChunkRangeStart] = useState(1);
  const [chunkRangeEnd, setChunkRangeEnd] = useState(0);

  const rangeLength = Math.max(0, (Number(chunkRangeEnd) || totalRows) - (Number(chunkRangeStart) || 1) + 1);

  const handleChunkingFromWidget = (body) => {
    setFieldErrors({});
    const from = Number(chunkRangeStart) || 1;
    const to = Number(chunkRangeEnd) || totalRows;
    if (from < 1 || to > totalRows || from > to) {
      setFieldErrors({ chunkRange: `Range must be from 1 to ${totalRows}, and from ≤ to (records)` });
      return;
    }
    if (!body.chunkSizes || !Array.isArray(body.chunkSizes) || body.chunkSizes.length === 0) {
      setFieldErrors({ chunkSize: 'Choose a split mode and enter values' });
      return;
    }
    const payload = { chunkRange: { start: from, end: to }, chunkSizes: body.chunkSizes };
    setLoading(true);
    setError('');
    fetch(`/api/sessions/${sessionId}/chunking`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(parseJsonResponse)
      .then(() => {
        setStep(4);
        if (headers.length > 0) {
          setLeftColumns([headers[0]]);
          setTargetColumn(headers.length >= 2 ? headers[headers.length - 1] : '');
        }
      })
      .catch((err) => setError(err.message || 'Failed'))
      .finally(() => setLoading(false));
  };

  // Step 4: Choose columns
  const handleSaveColumns = (e) => {
    e.preventDefault();
    setFieldErrors({});
    const target = targetColumnIsNew ? newColumnName : targetColumn;
    const errs = {};
    if (!target) errs.targetColumn = 'Select or enter label column';
    if (leftColumns.length === 0) errs.leftColumns = 'Select at least one left column';
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      return;
    }
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

  // Step 5: Configure label
  const handleSaveOptions = (e) => {
    e.preventDefault();
    setFieldErrors({});
    const options = targetOptions
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (options.length === 0) {
      setFieldErrors({ targetOptions: 'Enter at least one option' });
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
        setSuccessMessage('Project created');
        navigatingToSuccessRef.current = true;
        setTimeout(() => navigate(`/sessions/${sessionId}`), 1200);
      })
      .catch((err) => setError(err.message || 'Failed'))
      .finally(() => setLoading(false));
  };

  const handleCancel = () => {
    if (step === 1) {
      navigate('/');
      return;
    }
    if (!window.confirm('Discard and delete this draft project?')) return;
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Create project</h1>
        <button type="button" className="btn-nav" onClick={handleCancel} disabled={loading}>Cancel</button>
      </div>
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
      <div className="wizard-progress" aria-label={`Step ${step} of ${STEPS.length}`}>
        <span className="wizard-progress-text">Step {step} of {STEPS.length}</span>
        <div className="wizard-progress-bar" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={STEPS.length}>
          <div className="wizard-progress-fill" style={{ width: `${(step / STEPS.length) * 100}%` }} />
        </div>
      </div>

      {error && <p className="form-field-error" style={{ marginBottom: '0.75rem' }}>{error}</p>}
      {successMessage && <p className="form-success-message" role="status">{successMessage}</p>}
      {loading && (
        <p className="form-loading-message" aria-live="polite">
          <span className="form-spinner" aria-hidden="true" />
          {step === 1 && (fileSource === 'upload' ? 'Uploading…' : 'Loading…')}
          {step === 2 && 'Parsing sheet…'}
          {(step === 3 || step === 4) && 'Saving…'}
          {step === 5 && 'Creating project…'}
        </p>
      )}

      {step === 1 && (
        <form onSubmit={handleStep1Submit} className="form-fields">
          <div className="form-field">
            <label htmlFor="session-name">Project name:</label>
            <input
              id="session-name"
              type="text"
              className="form-input"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="e.g. Q1 review"
              required
              autoFocus
              aria-invalid={!!fieldErrors.sessionName}
              aria-describedby={fieldErrors.sessionName ? 'session-name-error' : undefined}
            />
            {fieldErrors.sessionName && <p id="session-name-error" className="form-field-error">{fieldErrors.sessionName}</p>}
          </div>

          <details className="form-advanced">
            <summary className="form-advanced-summary">Advanced</summary>
            <div className="form-advanced-content">
              <div className="form-field">
                <label htmlFor="creator-name">Creator name:</label>
                <input
                  id="creator-name"
                  type="text"
                  className="form-input"
                  value={creatorName}
                  onChange={(e) => setCreatorName(e.target.value)}
                  placeholder="Your name (optional)"
                />
              </div>
              <div className="form-field">
                <label htmlFor="delete-pin">Delete PIN:</label>
                <input
                  id="delete-pin"
                  type="password"
                  className="form-input"
                  value={deletePin}
                  onChange={(e) => setDeletePin(e.target.value)}
                  placeholder="Required to delete this project later (optional)"
                  autoComplete="off"
                />
              </div>
            </div>
          </details>

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
                <div className="form-input" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <input type="file" name="file" accept=".xlsx,.xls" required aria-invalid={!!fieldErrors.file} aria-describedby={fieldErrors.file ? 'file-error' : undefined} />
                  {fieldErrors.file && <p id="file-error" className="form-field-error">{fieldErrors.file}</p>}
                </div>
              </div>
            )}
            {fileSource === 'preloaded' && (
              <div className="form-field">
                <label htmlFor="preloaded-file">Preloaded file:</label>
                <div className="form-input" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                      id="preloaded-file"
                      value={selectedPreloadedPath}
                      onChange={(e) => setSelectedPreloadedPath(e.target.value)}
                      style={{ flex: '1 1 12rem', minWidth: '12rem' }}
                      aria-invalid={!!fieldErrors.file}
                      aria-describedby={fieldErrors.file ? 'file-error' : undefined}
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
                  </div>
                  {fieldErrors.file && <p id="file-error" className="form-field-error">{fieldErrors.file}</p>}
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
                {loading && <span className="form-spinner" aria-hidden="true" />}
                {loading ? (fileSource === 'upload' ? 'Uploading…' : 'Loading…') : (fileSource === 'upload' ? 'Upload' : 'Continue')}
              </button>
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
              autoFocus
              aria-invalid={!!fieldErrors.sheet}
              aria-describedby={fieldErrors.sheet ? 'sheet-error' : undefined}
            >
              <option value="">-- Select sheet --</option>
              {sheetNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            {fieldErrors.sheet && <p id="sheet-error" className="form-field-error">{fieldErrors.sheet}</p>}
          </div>
          <div className="form-field form-actions">
            <span className="form-field-spacer" />
            <div className="form-actions-buttons">
              <button type="submit" className="primary" disabled={loading}>
                {loading && <span className="form-spinner" aria-hidden="true" />}
                {loading ? 'Loading…' : 'Continue'}
              </button>
            </div>
          </div>
        </form>
      )}

      {step === 3 && (
        <div className="form-fields">
          <p className="form-info">
            Sheet has <strong>{totalRows}</strong> records.
            <span className="form-field-help" style={{ marginLeft: '0.35rem' }}>
              <span className="form-field-help-icon" tabIndex={0} aria-label="Help">ⓘ</span>
              <span className="form-field-help-text" role="tooltip">Use "From" and "To" to include only part of the sheet. Records outside this range are skipped.</span>
            </span>
          </p>
          <div className="form-field form-field-inline">
            <label htmlFor="from-row">From record:</label>
            <input
              id="from-row"
              type="number"
              min={1}
              max={totalRows}
              value={chunkRangeStart}
              onChange={(e) => setChunkRangeStart(e.target.value)}
              className="form-input-narrow"
              autoFocus
              aria-invalid={!!fieldErrors.chunkRange}
            />
            <label htmlFor="to-row">To record:</label>
            <input
              id="to-row"
              type="number"
              min={1}
              max={totalRows}
              value={chunkRangeEnd}
              onChange={(e) => setChunkRangeEnd(e.target.value)}
              className="form-input-narrow"
              aria-invalid={!!fieldErrors.chunkRange}
            />
            {fieldErrors.chunkRange && <p id="chunk-range-error" className="form-field-error" style={{ flex: '1 1 100%', marginTop: '0.25rem' }}>{fieldErrors.chunkRange}</p>}
          </div>
          {rangeLength > 0 && (
            <p className="form-info"><strong>{rangeLength}</strong> records chosen.</p>
          )}

          {fieldErrors.chunkSize && <p id="chunk-size-error" className="form-field-error" style={{ marginBottom: '0.5rem' }}>{fieldErrors.chunkSize}</p>}
          <ChunkingWidget
            totalRecords={rangeLength}
            title="Chunking"
            description="Split the chosen range into chunks. Each chunk is one review unit."
            confirmStep={false}
            submitLabel="Continue"
            onSubmit={handleChunkingFromWidget}
            collapsible={false}
            submitting={loading}
          />
        </div>
      )}

      {step === 4 && (
        <form onSubmit={handleSaveColumns} className="form-fields">
          <p className="form-info">Select columns for the left panel (read-only) and one label column.</p>

          <div className="form-section">
            <p className="form-section-title">
              Left panel columns (select one or more):
              <span className="form-field-help">
                <span className="form-field-help-icon" tabIndex={0} aria-label="Help">ⓘ</span>
                <span className="form-field-help-text" role="tooltip">Columns shown read-only on the left when reviewing. Select the ones you need for context.</span>
              </span>
            </p>
            <div className="form-checkbox-grid">
              {headers.map((col, idx) => (
                <label key={col} className="form-checkbox-item">
                  <input
                    type="checkbox"
                    checked={leftColumns.includes(col)}
                    onChange={() => toggleLeftColumn(col)}
                    autoFocus={idx === 0}
                    aria-invalid={!!fieldErrors.leftColumns}
                  />
                  <span>{col}</span>
                </label>
              ))}
            </div>
            {fieldErrors.leftColumns && <p className="form-field-error">{fieldErrors.leftColumns}</p>}
          </div>

          <div className="form-section">
            <p className="form-section-title">
              Label column (one):
              <span className="form-field-help">
                <span className="form-field-help-icon" tabIndex={0} aria-label="Help">ⓘ</span>
                <span className="form-field-help-text" role="tooltip">The column you'll update with status or choices. The options you configure in the next step become buttons for each record.</span>
              </span>
            </p>
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
                  aria-invalid={!!fieldErrors.targetColumn}
                  aria-describedby={fieldErrors.targetColumn ? 'target-column-error' : undefined}
                >
                  <option value="">-- Select --</option>
                  {headers.map((col) => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
                {fieldErrors.targetColumn && <p id="target-column-error" className="form-field-error">{fieldErrors.targetColumn}</p>}
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
                  aria-invalid={!!fieldErrors.targetColumn}
                />
              </div>
            </div>
          </div>

          <div className="form-field form-actions">
            <span className="form-field-spacer" />
            <div className="form-actions-buttons">
              <button type="submit" className="primary" disabled={loading}>
                {loading && <span className="form-spinner" aria-hidden="true" />}
                {loading ? 'Saving…' : 'Continue'}
              </button>
            </div>
          </div>
        </form>
      )}

      {step === 5 && (
        <form onSubmit={handleSaveOptions} className="form-fields">
          <p>Configure the options shown as buttons for the label column. One per line or comma-separated. Example: Approved, In Progress, Rejected</p>
          <textarea
            value={targetOptions}
            onChange={(e) => setTargetOptions(e.target.value)}
            placeholder="Option 1&#10;Option 2&#10;Option 3"
            rows={8}
            style={{ width: '100%', marginBottom: '1rem' }}
            autoFocus
            aria-invalid={!!fieldErrors.targetOptions}
            aria-describedby={fieldErrors.targetOptions ? 'target-options-error' : undefined}
          />
          {fieldErrors.targetOptions && <p id="target-options-error" className="form-field-error" style={{ marginTop: '-0.5rem', marginBottom: '1rem' }}>{fieldErrors.targetOptions}</p>}
          <div className="form-field form-actions">
            <span className="form-field-spacer" />
            <div className="form-actions-buttons">
              <button type="submit" className="primary" disabled={loading}>
                {loading && <span className="form-spinner" aria-hidden="true" />}
                {loading ? 'Creating…' : 'Finish and open project'}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
