import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { readdirSync, existsSync, unlinkSync } from 'fs';
import { getSheetNames, parseSheetInBatches } from '../services/excelService.js';
import * as sessionService from '../services/sessionService.js';
import { BATCH_SIZE } from '../services/excelService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '../../data/uploads');
const preloadedDir = path.resolve(
  process.env.PRELOADED_FILES_DIR || path.join(homedir(), '.excel_data_labelling', 'files')
);
const EXCEL_EXT = /\.(xlsx|xls)$/i;

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

// GET /api/sessions/preloaded-files — list .xlsx/.xls in PRELOADED_FILES_DIR
router.get('/preloaded-files', (req, res) => {
  try {
    if (!existsSync(preloadedDir)) {
      return res.json({ files: [] });
    }
    const entries = readdirSync(preloadedDir, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && EXCEL_EXT.test(e.name))
      .map((e) => ({ name: e.name, path: e.name }));
    res.json({ files });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to list preloaded files' });
  }
});

// POST /api/sessions/from-preloaded — create session from a preloaded file
router.post('/from-preloaded', async (req, res) => {
  try {
    const { preloadedPath, name, creator_name, delete_pin } = req.body;
    if (!preloadedPath || typeof preloadedPath !== 'string') {
      return res.status(400).json({ error: 'preloadedPath required' });
    }
    const resolved = path.resolve(preloadedDir, preloadedPath);
    const base = path.resolve(preloadedDir);
    const relative = path.relative(base, resolved);
    if (relative.startsWith('..') || relative.includes('..')) {
      return res.status(400).json({ error: 'Invalid preloaded path' });
    }
    if (!existsSync(resolved)) {
      return res.status(404).json({ error: 'File not found' });
    }
    const sheetNames = await getSheetNames(resolved);
    const sessionId = sessionService.createSession(
      resolved,
      name || null,
      path.basename(resolved),
      creator_name || null,
      delete_pin ?? null
    );
    res.json({ sessionId, sheetNames });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to create session from preloaded file' });
  }
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
    const deletePin = req.body.delete_pin != null ? String(req.body.delete_pin) : null;
    const sessionId = sessionService.createSession(filePath, req.body.name || null, req.file.originalname || null, req.body.creator_name || null, deletePin);
    res.json({ sessionId, sheetNames });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// PUT /api/sessions/:id/sheet — body: { sheetName, compare? }. Parse and store rows; do not create chunks.
router.put('/:id/sheet', async (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const session = sessionService.getSession(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const { sheetName, compare } = req.body;
    if (!sheetName) return res.status(400).json({ error: 'sheetName required' });
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

    sessionService.updateSessionSheet(sessionId, sheetName, headers, totalRows, { compareMode });

    res.json({ headers, totalRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Sheet parse failed' });
  }
});

// PUT /api/sessions/:id/chunking — body: { chunkRange: { start, end }, equalSize?, chunkSizes? }. 1-based inclusive range.
router.put('/:id/chunking', (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const session = sessionService.getSession(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const totalRows = session.total_rows ?? 0;
    const { chunkRange, equalSize, chunkSizes: reqChunkSizes } = req.body;
    if (!chunkRange || typeof chunkRange.start !== 'number' || typeof chunkRange.end !== 'number') {
      return res.status(400).json({ error: 'chunkRange.start and chunkRange.end (1-based inclusive) required' });
    }
    const start1 = Math.max(1, Number(chunkRange.start));
    const end1 = Math.min(totalRows, Number(chunkRange.end));
    if (start1 > end1) {
      return res.status(400).json({ error: 'chunkRange start must be <= end' });
    }
    const rangeStart = start1 - 1;
    const rangeEnd = end1;
    const rangeLength = rangeEnd - rangeStart;

    let chunkSizes;
    if (equalSize != null && equalSize !== '') {
      const size = Math.min(Math.max(1, parseInt(equalSize, 10)), 10000);
      if (size > rangeLength) {
        return res.status(400).json({ error: `Chunk size ${size} exceeds range length ${rangeLength}` });
      }
      chunkSizes = [size];
    } else if (Array.isArray(reqChunkSizes) && reqChunkSizes.length > 0) {
      chunkSizes = reqChunkSizes.map((s) => Math.min(Math.max(1, parseInt(s, 10)), 10000)).filter((s) => s > 0);
      if (chunkSizes.length === 0) {
        return res.status(400).json({ error: 'At least one valid chunk size required' });
      }
      for (const s of chunkSizes) {
        if (s > rangeLength) {
          return res.status(400).json({ error: `Chunk size ${s} exceeds range length ${rangeLength}` });
        }
      }
    } else {
      return res.status(400).json({ error: 'equalSize or chunkSizes required' });
    }

    sessionService.setChunking(sessionId, totalRows, { rangeStart, rangeEnd, chunkSizes });
    const chunks = sessionService.getChunks(sessionId);
    res.json({
      chunkRange: { start: start1, end: end1 },
      chunkSizes,
      chunkCount: chunks.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Chunking failed' });
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

// DELETE /api/sessions/:id/abandon — abandon draft/configured session (no PIN). For create-wizard cancel.
router.delete('/:id/abandon', (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const result = sessionService.deleteDraftSession(sessionId);
    if (!result.ok) {
      return res.status(result.error === 'Session not found' ? 404 : 400).json({ error: result.error });
    }
    if (result.filePath) {
      try {
        const relative = path.relative(uploadsDir, result.filePath);
        if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
          unlinkSync(result.filePath);
        }
      } catch (_) {
        // ignore file-not-found or other unlink errors
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Abandon failed' });
  }
});

// DELETE /api/sessions/:id — body: { pin }. Requires PIN if session has delete_pin set.
router.delete('/:id', (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const pin = req.body?.pin != null ? String(req.body.pin) : '';
    const result = sessionService.deleteSession(sessionId, pin);
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }
    if (result.filePath) {
      try {
        const relative = path.relative(uploadsDir, result.filePath);
        if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
          unlinkSync(result.filePath);
        }
      } catch (_) {
        // ignore file-not-found or other unlink errors
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Delete failed' });
  }
});

// GET /api/sessions/:id
router.get('/:id', (req, res) => {
  const sessionId = Number(req.params.id);
  const session = sessionService.getSession(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const config = sessionService.getSessionConfig(sessionId);
  const result = { ...session };
  delete result.delete_pin; // do not expose PIN hash to client
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

// PUT /api/sessions/:id/config/options — body: { targetOptions: string[] }
router.put('/:id/config/options', (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    if (!sessionService.getSession(sessionId)) return res.status(404).json({ error: 'Session not found' });
    const targetOptions = req.body.targetOptions || [];
    sessionService.updateSessionConfigOptions(sessionId, { targetOptions });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to save options' });
  }
});

export default router;
