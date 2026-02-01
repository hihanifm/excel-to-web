import { Router } from 'express';
import * as sessionService from '../services/sessionService.js';

const router = Router({ mergeParams: true });

// GET /api/sessions/:id/chunks?parentId= — omit parentId = top-level
router.get('/', (req, res) => {
  const sessionId = Number(req.params.id);
  if (!sessionService.getSession(sessionId)) return res.status(404).json({ error: 'Session not found' });
  const parentId = req.query.parentId !== undefined && req.query.parentId !== ''
    ? Number(req.query.parentId)
    : null;
  const chunks = sessionService.getChunks(sessionId, parentId);
  res.set('Cache-Control', 'no-store');
  res.json(chunks);
});

// PUT /api/sessions/:id/chunks/:chunkId/claim
router.put('/:chunkId/claim', (req, res) => {
  const sessionId = Number(req.params.id);
  const chunkId = Number(req.params.chunkId);
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const result = sessionService.claimChunk(sessionId, chunkId, name);
  if (!result.ok) return res.status(409).json({ error: result.error });
  res.json({ ok: true });
});

// PUT /api/sessions/:id/chunks/:chunkId/complete
router.put('/:chunkId/complete', (req, res) => {
  const sessionId = Number(req.params.id);
  const chunkId = Number(req.params.chunkId);
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const result = sessionService.completeChunk(sessionId, chunkId, name);
  if (!result.ok) return res.status(403).json({ error: result.error });
  res.json({ ok: true });
});

// PUT /api/sessions/:id/chunks/:chunkId/rechunk — body: { chunkSizes: number[] } (processed by frontend)
router.put('/:chunkId/rechunk', (req, res) => {
  const sessionId = Number(req.params.id);
  const chunkId = Number(req.params.chunkId);
  const { chunkSizes } = req.body || {};
  if (!Array.isArray(chunkSizes) || chunkSizes.length === 0) {
    return res.status(400).json({ error: 'chunkSizes (array of sizes) required' });
  }
  const result = sessionService.rechunkChunk(sessionId, chunkId, { chunkSizes });
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json({ ok: true });
});

// PUT /api/sessions/:id/chunks/:chunkId/assignee — body: { currentName, newName }
router.put('/:chunkId/assignee', (req, res) => {
  const sessionId = Number(req.params.id);
  const chunkId = Number(req.params.chunkId);
  const { currentName, newName } = req.body;
  if (newName === undefined || newName === null) return res.status(400).json({ error: 'newName required' });
  if (typeof currentName !== 'string') return res.status(400).json({ error: 'currentName required' });
  const result = sessionService.updateChunkAssignee(sessionId, chunkId, currentName, newName);
  if (!result.ok) return res.status(403).json({ error: result.error });
  res.json({ ok: true });
});

// PUT /api/sessions/:id/chunks/:chunkId/tag — body: { tag } (string, optional)
router.put('/:chunkId/tag', (req, res) => {
  const sessionId = Number(req.params.id);
  const chunkId = Number(req.params.chunkId);
  if (!sessionService.getSession(sessionId)) return res.status(404).json({ error: 'Session not found' });
  const tag = req.body.tag !== undefined ? req.body.tag : '';
  const result = sessionService.updateChunkTag(sessionId, chunkId, tag);
  if (!result.ok) return res.status(404).json({ error: result.error });
  res.json({ ok: true });
});

// GET /api/sessions/:id/chunks/:chunkId/row/:rowOffset — ?limit=N
router.get('/:chunkId/row/:rowOffset', (req, res) => {
  const sessionId = Number(req.params.id);
  const chunkId = Number(req.params.chunkId);
  const rowOffset = Number(req.params.rowOffset);
  const limit = Math.min(Math.max(1, parseInt(req.query.limit || '1', 10)), 100);

  const session = sessionService.getSession(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const config = sessionService.getSessionConfig(sessionId);
  if (!config) return res.status(400).json({ error: 'Session not configured' });

  const range = sessionService.getChunkRowRange(sessionId, chunkId);
  if (!range) return res.status(404).json({ error: 'Chunk not found' });
  const totalInChunk = range.endRow - range.startRow;
  if (rowOffset < 0 || rowOffset >= totalInChunk) {
    return res.status(400).json({ error: 'rowOffset out of range' });
  }
  const chunk = sessionService.getChunk(sessionId, chunkId);
  const labeledInChunk = chunk?.rowsEditedInChunk ?? 0;

  const startRow = range.startRow + rowOffset;
  const endRow = Math.min(startRow + limit, range.endRow);
  const headers = session.headers;
  const leftColumns = config.left_columns || [];
  const targetColumn = config.target_column;
  const targetColIndex = headers.indexOf(targetColumn);

  const rows = sessionService.getSessionRows(sessionId, startRow, endRow - startRow);
  const leftValuesByHeader = {};
  for (const col of leftColumns) {
    leftValuesByHeader[col] = headers.indexOf(col);
  }

  const resultRows = rows.map((r) => {
    const data = r.data;
    const leftValues = {};
    for (const [colName, colIdx] of Object.entries(leftValuesByHeader)) {
      if (colIdx !== -1) leftValues[colName] = data[colIdx] != null ? data[colIdx] : '';
    }
    const edit = sessionService.getRowEdit(sessionId, r.row_index);
    const targetCurrentValue = edit != null
      ? edit
      : (targetColIndex >= 0 && data[targetColIndex] != null && data[targetColIndex] !== '' ? String(data[targetColIndex]) : '');
    return {
      leftValues,
      targetCurrentValue,
      rowOffsetInChunk: r.row_index - range.startRow,
      rowIndex: r.row_index,
    };
  });

  res.json({
    rows: resultRows,
    offset: rowOffset,
    totalInChunk,
    chunkStartRow: range.startRow,
    chunkEndRow: range.endRow,
    labeledInChunk,
    headers: session.headers,
    targetOptions: config.target_options || [],
  });
});

// PUT /api/sessions/:id/chunks/:chunkId/rows-viewed — body: { name, rowOffsets: number[] }
router.put('/:chunkId/rows-viewed', (req, res) => {
  const sessionId = Number(req.params.id);
  const chunkId = Number(req.params.chunkId);
  const { name, rowOffsets } = req.body;
  if (!name || !Array.isArray(rowOffsets)) return res.status(400).json({ error: 'name and rowOffsets required' });
  const result = sessionService.markRowsAsViewed(sessionId, chunkId, name, rowOffsets);
  if (!result.ok) return res.status(403).json({ error: result.error });
  res.json({ ok: true });
});

// PUT /api/sessions/:id/chunks/:chunkId/row/:rowOffset
router.put('/:chunkId/row/:rowOffset', (req, res) => {
  const sessionId = Number(req.params.id);
  const chunkId = Number(req.params.chunkId);
  const rowOffset = Number(req.params.rowOffset);
  const { name, targetValue } = req.body;
  if (!name || targetValue === undefined) return res.status(400).json({ error: 'name and targetValue required' });

  const assignee = (sessionService.getChunkAssignee(sessionId, chunkId) ?? '').trim();
  if (assignee !== (name ?? '').trim()) return res.status(403).json({ error: 'Not your chunk' });

  const range = sessionService.getChunkRowRange(sessionId, chunkId);
  if (!range) return res.status(404).json({ error: 'Chunk not found' });
  const totalInChunk = range.endRow - range.startRow;
  if (rowOffset < 0 || rowOffset >= totalInChunk) return res.status(400).json({ error: 'rowOffset out of range' });

  const rowIndex = range.startRow + rowOffset;
  sessionService.saveRowEdit(sessionId, rowIndex, String(targetValue));
  const chunk = sessionService.getChunk(sessionId, chunkId);
  const labeledInChunk = Number(chunk?.rowsEditedInChunk ?? 0);
  res.json({ ok: true, rowIndex, nextOffset: rowOffset + 1, labeledInChunk });
});

// GET /api/sessions/:id/chunks/:chunkId — single chunk (after more specific :chunkId/... routes)
router.get('/:chunkId', (req, res) => {
  const sessionId = Number(req.params.id);
  const chunkId = Number(req.params.chunkId);
  if (!sessionService.getSession(sessionId)) return res.status(404).json({ error: 'Session not found' });
  const chunk = sessionService.getChunk(sessionId, chunkId);
  if (!chunk) return res.status(404).json({ error: 'Chunk not found' });
  res.set('Cache-Control', 'no-store');
  res.json(chunk);
});

export default router;
