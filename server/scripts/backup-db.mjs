#!/usr/bin/env node
/**
 * Backup SQLite database to server/data/backups/
 * Uses better-sqlite3 for consistent backup while app may be running.
 * Usage: node backup-db.mjs [--keep N] [--output path]
 */
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = join(__dirname, '..');
const DEFAULT_DB = join(SERVER_ROOT, 'data', 'excel-app.db');
const BACKUP_DIR = join(SERVER_ROOT, 'data', 'backups');

const args = process.argv.slice(2);
let keep = null;
let outputPath = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--keep' && args[i + 1]) {
    keep = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--output' && args[i + 1]) {
    outputPath = args[i + 1];
    i++;
  }
}

const dbPath = process.env.DB_PATH || DEFAULT_DB;

if (!existsSync(dbPath)) {
  console.error('Error: Database not found at', dbPath);
  process.exit(1);
}

if (!outputPath) {
  const now = new Date();
  const ts = now.toISOString().replace(/\D/g, '').slice(0, 14);
  mkdirSync(BACKUP_DIR, { recursive: true });
  outputPath = join(BACKUP_DIR, `excel-app-${ts}.db`);
} else {
  const outDir = dirname(outputPath);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
}

const dbPathResolved = resolve(process.cwd(), dbPath);
const outputPathResolved = resolve(process.cwd(), outputPath);

try {
  const db = new Database(dbPathResolved, { readonly: true });
  db.backup(outputPathResolved);
  db.close();
  console.log('Backup created:', outputPathResolved);
} catch (err) {
  console.error('Backup failed:', err.message);
  process.exit(1);
}

if (keep != null && keep > 0 && outputPath.startsWith(BACKUP_DIR)) {
  const files = readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.db'))
    .map((f) => ({
      path: join(BACKUP_DIR, f),
      mtime: statSync(join(BACKUP_DIR, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);
  for (let i = keep; i < files.length; i++) {
    unlinkSync(files[i].path);
    console.log('Removed old backup:', files[i].path);
  }
}
