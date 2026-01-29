import { getDb } from '../db/index.js';

export function createSession(filePath, name = null) {
  const db = getDb(process.env.DB_PATH);
  const stmt = db.prepare(
    'INSERT INTO sessions (file_path, name, status) VALUES (?, ?, ?)'
  );
  const result = stmt.run(filePath, name, 'draft');
  return result.lastInsertRowid;
}

export function getSession(id) {
  const db = getDb(process.env.DB_PATH);
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  if (!row) return null;
  return {
    ...row,
    headers: JSON.parse(row.headers || '[]'),
  };
}

export function updateSessionSheet(id, sheetName, headers, totalRows, chunkSize) {
  const db = getDb(process.env.DB_PATH);
  db.prepare(
    'UPDATE sessions SET sheet_name = ?, headers = ?, total_rows = ?, chunk_size = ?, status = ? WHERE id = ?'
  ).run(sheetName, JSON.stringify(headers), totalRows, chunkSize, 'configured', id);
}

export function deleteSessionRowsAndChunks(sessionId) {
  const db = getDb(process.env.DB_PATH);
  db.prepare('DELETE FROM session_rows WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM chunks WHERE session_id = ?').run(sessionId);
}

export function insertSessionRowsBatch(sessionId, rows) {
  if (rows.length === 0) return;
  const db = getDb(process.env.DB_PATH);
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO session_rows (session_id, row_index, data) VALUES (?, ?, ?)'
  );
  const insertMany = db.transaction((items) => {
    for (const { row_index, data } of items) {
      stmt.run(sessionId, row_index, JSON.stringify(data));
    }
  });
  insertMany(rows);
}

export function createChunks(sessionId, totalRows, chunkSize) {
  const db = getDb(process.env.DB_PATH);
  const stmt = db.prepare(
    'INSERT INTO chunks (session_id, chunk_index, start_row, end_row, status) VALUES (?, ?, ?, ?, ?)'
  );
  const insertAll = db.transaction(() => {
    for (let start = 0; start < totalRows; start += chunkSize) {
      const end = Math.min(start + chunkSize, totalRows);
      const chunkIndex = Math.floor(start / chunkSize);
      stmt.run(sessionId, chunkIndex, start, end, 'unclaimed');
    }
  });
  insertAll();
}

export function getSessionConfig(sessionId) {
  const db = getDb(process.env.DB_PATH);
  const row = db.prepare('SELECT * FROM session_config WHERE session_id = ?').get(sessionId);
  if (!row) return null;
  return {
    ...row,
    left_columns: JSON.parse(row.left_columns || '[]'),
    target_options: JSON.parse(row.target_options || '[]'),
  };
}

export function upsertSessionConfig(sessionId, { leftColumns, targetColumn, targetColumnIsNew }) {
  const db = getDb(process.env.DB_PATH);
  db.prepare(
    `INSERT INTO session_config (session_id, left_columns, target_column, target_column_is_new, target_options)
     VALUES (?, ?, ?, ?, '[]')
     ON CONFLICT(session_id) DO UPDATE SET
       left_columns = excluded.left_columns,
       target_column = excluded.target_column,
       target_column_is_new = excluded.target_column_is_new`
  ).run(sessionId, JSON.stringify(leftColumns || []), targetColumn, targetColumnIsNew ? 1 : 0);
}

export function updateSessionConfigOptions(sessionId, { targetOptions, referenceColumn }) {
  const db = getDb(process.env.DB_PATH);
  db.prepare(
    'UPDATE session_config SET target_options = ?, reference_column = ? WHERE session_id = ?'
  ).run(JSON.stringify(targetOptions || []), referenceColumn || null, sessionId);
  if (referenceColumn) {
    prepopulateRowEditsFromReferenceColumn(sessionId);
  }
}

/** Pre-populate row_edits with reference column values so target column is "as is" everywhere. */
function prepopulateRowEditsFromReferenceColumn(sessionId) {
  const config = getSessionConfig(sessionId);
  if (!config?.reference_column) return;
  const session = getSession(sessionId);
  if (!session) return;
  const headers = session.headers;
  const refColIndex = headers.indexOf(config.reference_column);
  if (refColIndex === -1) return;
  const db = getDb(process.env.DB_PATH);
  const rows = db.prepare(
    'SELECT row_index, data FROM session_rows WHERE session_id = ? ORDER BY row_index'
  ).all(sessionId);
  const stmt = db.prepare(
    'INSERT INTO row_edits (session_id, row_index, target_value, user_edited) VALUES (?, ?, ?, 0) ON CONFLICT(session_id, row_index) DO UPDATE SET target_value = excluded.target_value, user_edited = 0'
  );
  for (const row of rows) {
    const data = JSON.parse(row.data);
    const val = data[refColIndex];
    const targetValue = val != null && val !== '' ? String(val) : '';
    stmt.run(sessionId, row.row_index, targetValue);
  }
}

export function listSessions() {
  const db = getDb(process.env.DB_PATH);
  const rows = db.prepare(
    'SELECT id, name, file_path, sheet_name, total_rows, chunk_size, created_at, status FROM sessions ORDER BY created_at DESC'
  ).all();
  return rows.map((r) => ({ ...r, hasConfig: !!getSessionConfig(r.id) }));
}

export function getSessionStats(sessionId) {
  const db = getDb(process.env.DB_PATH);
  const session = getSession(sessionId);
  if (!session) return null;
  const chunks = db.prepare(
    'SELECT status FROM chunks WHERE session_id = ?'
  ).all(sessionId);
  const rowsEdited = db.prepare(
    'SELECT COUNT(*) as c FROM row_edits WHERE session_id = ? AND user_edited = 1'
  ).get(sessionId).c;
  const totalChunks = chunks.length;
  const chunksUnclaimed = chunks.filter((c) => c.status === 'unclaimed').length;
  const chunksInProgress = chunks.filter((c) => c.status === 'in_progress').length;
  const chunksCompleted = chunks.filter((c) => c.status === 'completed').length;
  return {
    totalChunks,
    chunksUnclaimed,
    chunksInProgress,
    chunksCompleted,
    totalRows: session.total_rows,
    rowsEdited,
    completionPct: totalChunks ? Math.round((chunksCompleted / totalChunks) * 100) : 0,
  };
}

export function getChunks(sessionId) {
  const db = getDb(process.env.DB_PATH);
  const chunks = db.prepare(
    `SELECT chunk_index, start_row, end_row, assignee_name, status, completed_at
     FROM chunks WHERE session_id = ? ORDER BY chunk_index`
  ).all(sessionId);
  const rowsEditedCount = db.prepare(
    `SELECT chunk_index, COUNT(*) as c FROM chunks ch
     JOIN row_edits re ON re.session_id = ch.session_id AND re.row_index >= ch.start_row AND re.row_index < ch.end_row AND re.user_edited = 1
     WHERE ch.session_id = ? GROUP BY ch.chunk_index`
  ).all(sessionId);
  const byChunk = Object.fromEntries(rowsEditedCount.map((r) => [r.chunk_index, r.c]));
  return chunks.map((c) => ({
    ...c,
    rowsInChunk: c.end_row - c.start_row,
    rowsEditedInChunk: byChunk[c.chunk_index] || 0,
  }));
}

export function claimChunk(sessionId, chunkIndex, name) {
  const db = getDb(process.env.DB_PATH);
  const chunk = db.prepare(
    'SELECT * FROM chunks WHERE session_id = ? AND chunk_index = ?'
  ).get(sessionId, chunkIndex);
  if (!chunk) return { ok: false, error: 'Chunk not found' };
  if (chunk.status !== 'unclaimed' && chunk.assignee_name !== name) {
    return { ok: false, error: 'Chunk already claimed by someone else' };
  }
  db.prepare(
    'UPDATE chunks SET assignee_name = ?, claimed_at = datetime(\'now\'), status = ? WHERE session_id = ? AND chunk_index = ?'
  ).run(name, 'in_progress', sessionId, chunkIndex);
  return { ok: true };
}

export function completeChunk(sessionId, chunkIndex, name) {
  const db = getDb(process.env.DB_PATH);
  const chunk = db.prepare(
    'SELECT * FROM chunks WHERE session_id = ? AND chunk_index = ?'
  ).get(sessionId, chunkIndex);
  if (!chunk) return { ok: false, error: 'Chunk not found' };
  if (chunk.assignee_name !== name) return { ok: false, error: 'Not your chunk' };
  db.prepare(
    'UPDATE chunks SET status = ?, completed_at = datetime(\'now\') WHERE session_id = ? AND chunk_index = ?'
  ).run('completed', sessionId, chunkIndex);
  return { ok: true };
}

export function getChunkRowRange(sessionId, chunkIndex) {
  const db = getDb(process.env.DB_PATH);
  const chunk = db.prepare(
    'SELECT start_row, end_row FROM chunks WHERE session_id = ? AND chunk_index = ?'
  ).get(sessionId, chunkIndex);
  return chunk ? { startRow: chunk.start_row, endRow: chunk.end_row } : null;
}

export function getChunkAssignee(sessionId, chunkIndex) {
  const db = getDb(process.env.DB_PATH);
  const chunk = db.prepare(
    'SELECT assignee_name FROM chunks WHERE session_id = ? AND chunk_index = ?'
  ).get(sessionId, chunkIndex);
  return chunk?.assignee_name;
}

export function getSessionRows(sessionId, offset, limit) {
  const db = getDb(process.env.DB_PATH);
  const rows = db.prepare(
    'SELECT row_index, data FROM session_rows WHERE session_id = ? AND row_index >= ? ORDER BY row_index LIMIT ?'
  ).all(sessionId, offset, limit);
  return rows.map((r) => ({ row_index: r.row_index, data: JSON.parse(r.data) }));
}

export function getRowEdit(sessionId, rowIndex) {
  const db = getDb(process.env.DB_PATH);
  const row = db.prepare(
    'SELECT target_value FROM row_edits WHERE session_id = ? AND row_index = ?'
  ).get(sessionId, rowIndex);
  return row?.target_value;
}

export function saveRowEdit(sessionId, rowIndex, targetValue) {
  const db = getDb(process.env.DB_PATH);
  db.prepare(
    'INSERT INTO row_edits (session_id, row_index, target_value, user_edited) VALUES (?, ?, ?, 1) ON CONFLICT(session_id, row_index) DO UPDATE SET target_value = excluded.target_value, user_edited = 1'
  ).run(sessionId, rowIndex, targetValue);
}

/** Mark rows as viewed by user (set user_edited=1 so they count in progress). */
export function markRowsAsViewed(sessionId, chunkIndex, name, rowOffsets) {
  const assignee = getChunkAssignee(sessionId, chunkIndex);
  if (assignee !== name) return { ok: false, error: 'Not your chunk' };
  const range = getChunkRowRange(sessionId, chunkIndex);
  if (!range) return { ok: false, error: 'Chunk not found' };
  const totalInChunk = range.endRow - range.startRow;
  const db = getDb(process.env.DB_PATH);
  const stmt = db.prepare(
    'UPDATE row_edits SET user_edited = 1 WHERE session_id = ? AND row_index = ?'
  );
  for (const off of rowOffsets) {
    if (off < 0 || off >= totalInChunk) continue;
    const rowIndex = range.startRow + off;
    stmt.run(sessionId, rowIndex);
  }
  return { ok: true };
}

export function getUniqueColumnValues(sessionId, columnName) {
  const session = getSession(sessionId);
  if (!session) return [];
  const headers = session.headers;
  const colIndex = headers.indexOf(columnName);
  if (colIndex === -1) return [];
  const db = getDb(process.env.DB_PATH);
  const rows = db.prepare(
    'SELECT data FROM session_rows WHERE session_id = ? ORDER BY row_index'
  ).all(sessionId);
  const seen = new Set();
  const values = [];
  for (const row of rows) {
    const data = JSON.parse(row.data);
    const v = data[colIndex];
    const normalized = v == null || v === '' ? null : String(v).trim();
    if (normalized !== null && !seen.has(normalized)) {
      seen.add(normalized);
      values.push(normalized);
    }
  }
  return values.sort();
}

export function getAllSessionRowsForExport(sessionId) {
  const db = getDb(process.env.DB_PATH);
  const rows = db.prepare(
    'SELECT row_index, data FROM session_rows WHERE session_id = ? ORDER BY row_index'
  ).all(sessionId);
  return rows.map((r) => ({ row_index: r.row_index, data: JSON.parse(r.data) }));
}

export function getAllRowEdits(sessionId) {
  const db = getDb(process.env.DB_PATH);
  const rows = db.prepare(
    'SELECT row_index, target_value FROM row_edits WHERE session_id = ?'
  ).all(sessionId);
  return Object.fromEntries(rows.map((r) => [r.row_index, r.target_value]));
}
