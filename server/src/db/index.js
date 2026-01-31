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
    const cols = db.prepare('PRAGMA table_info(sessions)').all().map((c) => c.name);
    if (!cols.includes('creator_name')) {
      db.exec('ALTER TABLE sessions ADD COLUMN creator_name TEXT');
    }
    if (!cols.includes('delete_pin')) {
      db.exec('ALTER TABLE sessions ADD COLUMN delete_pin TEXT');
    }
    const chunkCols = db.prepare('PRAGMA table_info(chunks)').all().map((c) => c.name);
    if (!chunkCols.includes('id')) {
      db.exec('DROP TABLE IF EXISTS chunks');
      db.exec(`CREATE TABLE chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES chunks(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  start_row INTEGER NOT NULL,
  end_row INTEGER NOT NULL,
  assignee_name TEXT,
  claimed_at TEXT,
  status TEXT NOT NULL DEFAULT 'unclaimed',
  completed_at TEXT,
  tag TEXT
)`);
      db.exec('CREATE INDEX IF NOT EXISTS idx_chunks_parent ON chunks(session_id, parent_id)');
    } else if (!chunkCols.includes('tag')) {
      db.exec('ALTER TABLE chunks ADD COLUMN tag TEXT');
    }
    const sessionCount = db.prepare('SELECT COUNT(*) as n FROM sessions').get().n;
    console.log(`Sessions in DB: ${sessionCount}`);
  }
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
