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
