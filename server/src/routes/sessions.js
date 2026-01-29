import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSheetNames, parseSheetInBatches } from '../services/excelService.js';
import * as sessionService from '../services/sessionService.js';
import { BATCH_SIZE } from '../services/excelService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '../../data/uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.random().toString(36).slice(2, 9);
    const ext = path.extname(file.originalname) || '.xlsx';
    cb(null, unique + ext);
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB

const router = Router();

// GET /api/sessions — list sessions
router.get('/', (req, res) => {
  const list = sessionService.listSessions();
  res.json(list);
});

// GET /api/sessions/:id/stats
router.get('/:id/stats', (req, res) => {
  const sessionId = Number(req.params.id);
  const stats = sessionService.getSessionStats(sessionId);
  if (!stats) return res.status(404).json({ error: 'Session not found' });
  res.json(stats);
});

// POST /api/sessions/upload — multipart file only
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const filePath = req.file.path;
    const sheetNames = await getSheetNames(filePath);
    const sessionId = sessionService.createSession(filePath, req.body.name || null);
    res.json({ sessionId, sheetNames });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// PUT /api/sessions/:id/sheet — body: { sheetName, chunkSize?, compare? }
router.put('/:id/sheet', async (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const session = sessionService.getSession(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const { sheetName, chunkSize: reqChunkSize, compare } = req.body;
    if (!sheetName) return res.status(400).json({ error: 'sheetName required' });
    const chunkSize = Math.min(Math.max(1, parseInt(reqChunkSize || session.chunk_size || 100, 10)), 1000);
    const compareMode = !!compare;

    sessionService.deleteSessionRowsAndChunks(sessionId);

    let headers = null;
    let totalRows = 0;
    const batch = [];

    for await (const { headers: h, rowIndex, data } of parseSheetInBatches(session.file_path, sheetName)) {
      if (headers === null) headers = h;
      batch.push({ row_index: rowIndex, data });
      if (batch.length >= BATCH_SIZE) {
        sessionService.insertSessionRowsBatch(sessionId, batch);
        totalRows += batch.length;
        batch.length = 0;
      }
    }
    if (batch.length > 0) {
      sessionService.insertSessionRowsBatch(sessionId, batch);
      totalRows += batch.length;
    }

    sessionService.updateSessionSheet(sessionId, sheetName, headers, totalRows, chunkSize, { compareMode });
    if (!compareMode) {
      sessionService.createChunks(sessionId, totalRows, chunkSize);
    }

    res.json({ headers, totalRows, chunkSize });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Sheet parse failed' });
  }
});

// GET /api/sessions/:id/compare — query: col1, col2
router.get('/:id/compare', (req, res) => {
  const sessionId = Number(req.params.id);
  const session = sessionService.getSession(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const { col1, col2 } = req.query;
  if (!col1 || !col2) return res.status(400).json({ error: 'col1 and col2 query params required' });
  const headers = session.headers;
  if (!headers.includes(col1)) return res.status(400).json({ error: `Column not found: ${col1}` });
  if (!headers.includes(col2)) return res.status(400).json({ error: `Column not found: ${col2}` });
  const stats = sessionService.getCompareStats(sessionId, col1, col2);
  if (!stats) return res.status(500).json({ error: 'Failed to compute compare stats' });
  res.json(stats);
});

// GET /api/sessions/:id
router.get('/:id', (req, res) => {
  const sessionId = Number(req.params.id);
  const session = sessionService.getSession(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const config = sessionService.getSessionConfig(sessionId);
  const result = { ...session };
  if (config) result.config = config;
  if (req.query.stats === '1') result.stats = sessionService.getSessionStats(sessionId);
  res.json(result);
});

// PUT /api/sessions/:id/config — body: { leftColumns[], targetColumn, targetColumnIsNew? }
router.put('/:id/config', (req, res) => {
  const sessionId = Number(req.params.id);
  if (!sessionService.getSession(sessionId)) return res.status(404).json({ error: 'Session not found' });
  const { leftColumns, targetColumn, targetColumnIsNew } = req.body;
  if (!targetColumn) return res.status(400).json({ error: 'targetColumn required' });
  sessionService.upsertSessionConfig(sessionId, {
    leftColumns: leftColumns || [],
    targetColumn,
    targetColumnIsNew: !!targetColumnIsNew,
  });
  res.json({ ok: true });
});

// GET /api/sessions/:id/columns/:columnName/unique
router.get('/:id/columns/:columnName/unique', (req, res) => {
  const sessionId = Number(req.params.id);
  const columnName = req.params.columnName;
  if (!sessionService.getSession(sessionId)) return res.status(404).json({ error: 'Session not found' });
  const values = sessionService.getUniqueColumnValues(sessionId, columnName);
  res.json({ values });
});

// PUT /api/sessions/:id/config/options — body: { targetOptions: string[], referenceColumn?: string }
router.put('/:id/config/options', (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    if (!sessionService.getSession(sessionId)) return res.status(404).json({ error: 'Session not found' });
    const { targetOptions, referenceColumn } = req.body;
    sessionService.updateSessionConfigOptions(sessionId, { targetOptions: targetOptions || [], referenceColumn: referenceColumn || null });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to save options' });
  }
});

export default router;
