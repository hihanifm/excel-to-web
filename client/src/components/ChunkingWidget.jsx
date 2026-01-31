import { useState } from 'react';

/**
 * Shared chunking widget: Split by Equal / Count (comma-separated) / Percentage (comma-separated).
 * All logic is in the frontend; emits processed { chunkSizes: number[] } via onSubmit.
 * @param {Object} props
 * @param {number} props.totalRecords - Total records to split
 * @param {string} [props.recordRangeLabel] - Optional label e.g. "records 26–37"
 * @param {string} props.title - Card title (e.g. "Re-chunk" or "Chunking")
 * @param {string} props.description - Short description
 * @param {boolean} [props.confirmStep] - If true, show inline Confirm/Back before calling onSubmit
 * @param {string} props.submitLabel - Button label (e.g. "Split" or "Continue")
 * @param {(body: { chunkSizes: number[] }) => void} props.onSubmit - Called with processed chunk sizes (after Confirm if confirmStep)
 * @param {boolean} [props.collapsible] - If true, show trigger button; when opened show form
 * @param {string} [props.triggerLabel] - Label for trigger when collapsible (e.g. "Split this chunk")
 * @param {boolean} [props.submitting] - If true, disable primary/Confirm button (e.g. while parent is calling API)
 */
export default function ChunkingWidget({
  totalRecords,
  recordRangeLabel,
  title,
  description,
  confirmStep = false,
  submitLabel,
  onSubmit,
  collapsible = false,
  triggerLabel = 'Split this chunk',
  submitting = false,
}) {
  const [open, setOpen] = useState(!collapsible);
  const [mode, setMode] = useState('equal');
  const [numChunks, setNumChunks] = useState('2');
  const [countsStr, setCountsStr] = useState('');
  const [percentagesStr, setPercentagesStr] = useState('');
  const [error, setError] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmBody, setConfirmBody] = useState(null);

  const handlePrimary = () => {
    setError('');
    let chunkSizes = [];
    let msg = '';
    const total = totalRecords ?? 0;

    if (mode === 'equal') {
      const num = parseInt(numChunks, 10);
      if (Number.isNaN(num) || num < 2) {
        setError('Enter at least 2 sub-chunks');
        return;
      }
      const n = Math.floor(num);
      const size = Math.floor(total / n);
      const remainder = total - size * n;
      chunkSizes = Array(n).fill(size);
      if (remainder > 0) chunkSizes[n - 1] = size + remainder;
      msg = `${chunkSizes.length} chunks will be created.`;
    } else if (mode === 'count') {
      const parts = countsStr.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => parseInt(s, 10));
      if (parts.length < 1 || parts.some((n) => Number.isNaN(n) || n < 1)) {
        setError('Enter at least one positive number (e.g. 5 or 5, 10, 15)');
        return;
      }
      const sum = parts.reduce((a, b) => a + b, 0);
      if (sum > total) {
        setError(`Sum of counts (${sum}) exceeds chunk size (${total} records).`);
        return;
      }
      chunkSizes = sum < total ? [...parts, total - sum] : [...parts];
      msg = `${chunkSizes.length} chunks will be created.`;
      if (sum < total) {
        msg += ` The last chunk will have the remaining ${total - sum} records.`;
      }
    } else {
      const parts = percentagesStr.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => parseFloat(s, 10));
      if (parts.length < 1 || parts.some((n) => Number.isNaN(n) || n < 0)) {
        setError('Enter at least one number (e.g. 25 or 25, 50, 25)');
        return;
      }
      const sum = parts.reduce((a, b) => a + b, 0);
      if (sum > 100.01) {
        setError('Percentages must not exceed 100');
        return;
      }
      const remainderPct = 100 - sum;
      const percentages = remainderPct > 0.01 ? [...parts, remainderPct] : parts;
      chunkSizes = percentages.map((p) => Math.floor((total * p) / 100));
      const remainderRecords = total - chunkSizes.reduce((a, b) => a + b, 0);
      if (remainderRecords > 0 && chunkSizes.length > 0) {
        chunkSizes[chunkSizes.length - 1] = (chunkSizes[chunkSizes.length - 1] ?? 0) + remainderRecords;
      }
      msg = `${chunkSizes.length} chunks will be created.`;
      if (remainderPct > 0.01) {
        msg += ` The last chunk will have the remaining ${Math.round(remainderPct * 10) / 10}%.`;
      }
    }

    const body = { chunkSizes };
    if (confirmStep) {
      setConfirmMessage(msg);
      setConfirmBody(body);
      setPendingConfirm(true);
    } else {
      onSubmit(body);
    }
  };

  const handleConfirm = () => {
    if (!confirmBody) return;
    onSubmit(confirmBody);
    setPendingConfirm(false);
    setConfirmBody(null);
    setConfirmMessage('');
    if (collapsible) setOpen(false);
  };

  const handleConfirmCancel = () => {
    setPendingConfirm(false);
    setConfirmBody(null);
    setConfirmMessage('');
  };

  const clearConfirmOnModeChange = () => {
    setError('');
    setPendingConfirm(false);
    setConfirmBody(null);
    setConfirmMessage('');
  };

  const handleCancel = () => {
    setOpen(false);
    setError('');
    setPendingConfirm(false);
    setConfirmBody(null);
    setConfirmMessage('');
  };

  const showForm = open && (totalRecords == null || totalRecords > 0);

  return (
    <div className="card rechunk-widget-card">
      <header className="rechunk-widget-header">
        <h2 className="rechunk-widget-title">{title}</h2>
      </header>
      <p className="rechunk-widget-desc">{description}</p>
      {totalRecords != null && totalRecords > 0 && (
        <p className="rechunk-widget-stats" aria-label="Chunk stats">
          <strong>{totalRecords}</strong> record{totalRecords !== 1 ? 's' : ''}
          {recordRangeLabel ? (
            <span className="rechunk-widget-stats-range"> ({recordRangeLabel})</span>
          ) : null}
        </p>
      )}
      {showForm ? (
        <div className="rechunk-widget-form">
          <fieldset className="rechunk-widget-modes">
            <legend className="rechunk-widget-legend">Split by</legend>
            <label className="rechunk-widget-radio">
              <input
                type="radio"
                name="chunkMode"
                value="equal"
                checked={mode === 'equal'}
                onChange={() => { setMode('equal'); clearConfirmOnModeChange(); }}
              />
              <span>Equal</span>
            </label>
            <label className="rechunk-widget-radio">
              <input
                type="radio"
                name="chunkMode"
                value="count"
                checked={mode === 'count'}
                onChange={() => { setMode('count'); clearConfirmOnModeChange(); }}
              />
              <span>Count (comma-separated)</span>
            </label>
            <label className="rechunk-widget-radio">
              <input
                type="radio"
                name="chunkMode"
                value="percentage"
                checked={mode === 'percentage'}
                onChange={() => { setMode('percentage'); clearConfirmOnModeChange(); }}
              />
              <span>Percentage (comma-separated)</span>
            </label>
          </fieldset>
          {mode === 'equal' && (
            <label className="rechunk-widget-label">
              Number of sub-chunks
              <input
                type="number"
                min={2}
                value={numChunks}
                onChange={(e) => { setNumChunks(e.target.value); clearConfirmOnModeChange(); }}
                className="rechunk-widget-input"
                aria-label="Number of sub-chunks"
              />
            </label>
          )}
          {mode === 'count' && (
            <label className="rechunk-widget-label">
              Row counts (e.g. 5, 10, 15)
              <input
                type="text"
                value={countsStr}
                onChange={(e) => { setCountsStr(e.target.value); clearConfirmOnModeChange(); }}
                className="rechunk-widget-input rechunk-widget-input-wide"
                placeholder="5, 10, 15"
                aria-label="Row counts comma-separated"
              />
            </label>
          )}
          {mode === 'percentage' && (
            <label className="rechunk-widget-label">
              Percentages, sum to 100 (e.g. 25, 50, 25)
              <input
                type="text"
                value={percentagesStr}
                onChange={(e) => { setPercentagesStr(e.target.value); clearConfirmOnModeChange(); }}
                className="rechunk-widget-input rechunk-widget-input-wide"
                placeholder="25, 50, 25"
                aria-label="Percentages comma-separated"
              />
            </label>
          )}
          {error && <p className="chunk-editor-error" role="alert">{error}</p>}
          {pendingConfirm ? (
            <div className="rechunk-widget-confirm">
              <p className="rechunk-widget-confirm-msg">{confirmMessage}</p>
              <div className="rechunk-widget-actions">
                <button type="button" className="btn-nav" onClick={handleConfirm} disabled={submitting}>
                  {submitting ? 'Saving…' : 'Confirm'}
                </button>
                <button type="button" onClick={handleConfirmCancel} disabled={submitting}>Back</button>
              </div>
            </div>
          ) : (
            <div className="rechunk-widget-actions">
              <button type="button" className="btn-nav" onClick={handlePrimary} disabled={submitting}>
                {submitting ? 'Saving…' : submitLabel}
              </button>
              {collapsible ? (
                <button type="button" onClick={handleCancel} disabled={submitting}>Cancel</button>
              ) : null}
            </div>
          )}
        </div>
      ) : collapsible ? (
        <button type="button" className="btn-link rechunk-widget-trigger" onClick={() => setOpen(true)}>
          {triggerLabel}
        </button>
      ) : null}
    </div>
  );
}
