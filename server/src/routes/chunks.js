import { Router } from 'express';
import * as sessionService from '../services/sessionService.js';

const router = Router({ mergeParams: true });

// GET /api/sessions/:id/chunks
router.get('/', (req, res) => {
  const sessionId = Number(req.params.id);
  if (!sessionService.getSession(sessionId)) return res.status(404).json({ error: 'Session not found' });
  const chunks = sessionService.getChunks(sessionId);
  res.json(chunks);
});

// PUT /api/sessions/:id/chunks/:chunkIndex/claim
router.put('/:chunkIndex/claim', (req, res) => {
  const sessionId = Number(req.params.id);
  const chunkIndex = Number(req.params.chunkIndex);
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const result = sessionService.claimChunk(sessionId, chunkIndex, name);
  if (!result.ok) return res.status(409).json({ error: result.error });
  res.json({ ok: true });
});

// PUT /api/sessions/:id/chunks/:chunkIndex/complete
router.put('/:chunkIndex/complete', (req, res) => {
  const sessionId = Number(req.params.id);
  const chunkIndex = Number(req.params.chunkIndex);
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const result = sessionService.completeChunk(sessionId, chunkIndex, name);
  if (!result.ok) return res.status(403).json({ error: result.error });
  res.json({ ok: true });
});

// GET /api/sessions/:id/chunks/:chunkIndex/row/:rowOffset — ?limit=N
router.get('/:chunkIndex/row/:rowOffset', (req, res) => {
  const sessionId = Number(req.params.id);
  const chunkIndex = Number(req.params.chunkIndex);
  const rowOffset = Number(req.params.rowOffset);
  const limit = Math.min(Math.max(1, parseInt(req.query.limit || '1', 10)), 100);

  const session = sessionService.getSession(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const config = sessionService.getSessionConfig(sessionId);
  if (!config) return res.status(400).json({ error: 'Session not configured' });

  const range = sessionService.getChunkRowRange(sessionId, chunkIndex);
  if (!range) return res.status(404).json({ error: 'Chunk not found' });
  const totalInChunk = range.endRow - range.startRow;
  if (rowOffset < 0 || rowOffset >= totalInChunk) {
    return res.status(400).json({ error: 'rowOffset out of range' });
  }

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
    const targetCurrentValue = targetColIndex >= 0 ? (data[targetColIndex] != null ? data[targetColIndex] : '') : '';
    const edit = sessionService.getRowEdit(sessionId, r.row_index);
    return {
      leftValues,
      targetCurrentValue: edit != null ? edit : targetCurrentValue,
      rowOffsetInChunk: r.row_index - range.startRow,
      rowIndex: r.row_index,
    };
  });

  res.json({
    rows: resultRows,
    offset: rowOffset,
    totalInChunk,
    headers: session.headers,
    targetOptions: config.target_options || [],
  });
});

// PUT /api/sessions/:id/chunks/:chunkIndex/row/:rowOffset
router.put('/:chunkIndex/row/:rowOffset', (req, res) => {
  const sessionId = Number(req.params.id);
  const chunkIndex = Number(req.params.chunkIndex);
  const rowOffset = Number(req.params.rowOffset);
  const { name, targetValue } = req.body;
  if (!name || targetValue === undefined) return res.status(400).json({ error: 'name and targetValue required' });

  const assignee = sessionService.getChunkAssignee(sessionId, chunkIndex);
  if (assignee !== name) return res.status(403).json({ error: 'Not your chunk' });

  const range = sessionService.getChunkRowRange(sessionId, chunkIndex);
  if (!range) return res.status(404).json({ error: 'Chunk not found' });
  const totalInChunk = range.endRow - range.startRow;
  if (rowOffset < 0 || rowOffset >= totalInChunk) return res.status(400).json({ error: 'rowOffset out of range' });

  const rowIndex = range.startRow + rowOffset;
  sessionService.saveRowEdit(sessionId, rowIndex, String(targetValue));
  res.json({ ok: true, rowIndex, nextOffset: rowOffset + 1 });
});

export default router;
