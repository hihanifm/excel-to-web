import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';
import sessionsRouter from './routes/sessions.js';
import chunksRouter from './routes/chunks.js';
import exportRouter from './routes/export.js';
import { getDb } from './db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3000', 10);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/excel-app.db');
const UPLOADS_DIR = path.join(__dirname, '../data/uploads');

process.env.DB_PATH = DB_PATH;

if (!existsSync(path.dirname(DB_PATH))) mkdirSync(path.dirname(DB_PATH), { recursive: true });
if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

getDb(DB_PATH);

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/sessions', sessionsRouter);
app.use('/api/sessions/:id/chunks', chunksRouter);
app.use('/api/sessions/:id/export', exportRouter);

const clientDist = path.join(__dirname, '../../client/dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});
