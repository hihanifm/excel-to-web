import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db = null;

export function getDb(dbPath) {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
    db.exec(schema);
    migrateChunkingColumns(db);
  }
  return db;
}

function migrateChunkingColumns(db) {
  const cols = db.prepare('PRAGMA table_info(sessions)').all().map((c) => c.name);
  if (cols.includes('chunk_range_start')) return;
  db.exec(`ALTER TABLE sessions ADD COLUMN chunk_range_start INTEGER NOT NULL DEFAULT 0`);
  db.exec(`ALTER TABLE sessions ADD COLUMN chunk_range_end INTEGER`);
  db.exec(`ALTER TABLE sessions ADD COLUMN chunk_sizes TEXT NOT NULL DEFAULT '[100]'`);
  db.prepare(
    `UPDATE sessions SET chunk_range_start = 0, chunk_range_end = total_rows, chunk_sizes = json_insert('[]', '$[0]', chunk_size) WHERE chunk_range_end IS NULL AND total_rows IS NOT NULL`
  ).run();
  db.prepare(`UPDATE sessions SET chunk_range_end = total_rows WHERE chunk_range_end IS NULL`).run();
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
