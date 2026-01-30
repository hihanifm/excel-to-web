import { getDb } from '../db/index.js';

export function createSession(filePath, name = null, originalFilename = null, creatorName = null) {
  const db = getDb(process.env.DB_PATH);
  const stmt = db.prepare(
    'INSERT INTO sessions (file_path, name, original_filename, creator_name, status) VALUES (?, ?, ?, ?, ?)'
  );
  const result = stmt.run(filePath, name, originalFilename, creatorName, 'draft');
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

export function updateSessionSheet(id, sheetName, headers, totalRows, options = {}) {
  const db = getDb(process.env.DB_PATH);
  const status = options.compareMode ? 'draft' : 'configured';
  db.prepare(
    'UPDATE sessions SET sheet_name = ?, headers = ?, total_rows = ?, status = ? WHERE id = ?'
  ).run(sheetName, JSON.stringify(headers), totalRows, status, id);
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

export function createChunks(sessionId, totalRows, options = {}) {
  const rangeStart = options.rangeStart ?? 0;
  const rangeEnd = options.rangeEnd ?? totalRows;
  const chunkSizes = Array.isArray(options.chunkSizes) && options.chunkSizes.length > 0
    ? options.chunkSizes.filter((s) => Number(s) > 0).map(Number)
    : [100];
  const start = Math.max(0, rangeStart);
  const end = Math.min(totalRows, rangeEnd);
  const db = getDb(process.env.DB_PATH);
  const stmt = db.prepare(
    'INSERT INTO chunks (session_id, chunk_index, start_row, end_row, status) VALUES (?, ?, ?, ?, ?)'
  );
  const insertAll = db.transaction(() => {
    let cursor = start;
    let chunkIndex = 0;
    while (cursor < end) {
      const sizeIndex = chunkIndex % chunkSizes.length;
      const size = chunkSizes[sizeIndex];
      const chunkEnd = Math.min(cursor + size, end);
      stmt.run(sessionId, chunkIndex, cursor, chunkEnd, 'unclaimed');
      cursor = chunkEnd;
      chunkIndex += 1;
    }
  });
  insertAll();
}

export function setChunking(sessionId, totalRows, options = {}) {
  const rangeStart = options.rangeStart ?? 0;
  const rangeEnd = options.rangeEnd ?? totalRows;
  const chunkSizes = Array.isArray(options.chunkSizes) && options.chunkSizes.length > 0
    ? options.chunkSizes.filter((s) => Number(s) > 0).map(Number)
    : [100];
  const start = Math.max(0, rangeStart);
  const end = Math.min(totalRows, rangeEnd);
  const rangeLength = end - start;
  for (const s of chunkSizes) {
    if (s > rangeLength) {
      throw new Error(`Chunk size ${s} exceeds range length ${rangeLength}`);
    }
  }
  const db = getDb(process.env.DB_PATH);
  db.prepare(
    'UPDATE sessions SET chunk_range_start = ?, chunk_range_end = ?, chunk_sizes = ? WHERE id = ?'
  ).run(start, end, JSON.stringify(chunkSizes), sessionId);
  db.prepare('DELETE FROM chunks WHERE session_id = ?').run(sessionId);
  createChunks(sessionId, totalRows, { rangeStart: start, rangeEnd: end, chunkSizes });
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
    'SELECT id, name, creator_name, file_path, sheet_name, total_rows, chunk_range_start, chunk_range_end, chunk_sizes, created_at, status FROM sessions ORDER BY created_at DESC'
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

export function getChunk(sessionId, chunkIndex) {
  const db = getDb(process.env.DB_PATH);
  const chunk = db.prepare(
    'SELECT chunk_index, start_row, end_row, assignee_name, status, completed_at FROM chunks WHERE session_id = ? AND chunk_index = ?'
  ).get(sessionId, chunkIndex);
  if (!chunk) return null;
  const rowsEdited = db.prepare(
    `SELECT COUNT(*) as c FROM row_edits WHERE session_id = ? AND row_index >= ? AND row_index < ? AND user_edited = 1`
  ).get(sessionId, chunk.start_row, chunk.end_row);
  return {
    ...chunk,
    rowsInChunk: chunk.end_row - chunk.start_row,
    rowsEditedInChunk: rowsEdited?.c ?? 0,
  };
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

/**
 * Compute compare stats for two columns: value distribution and same/different row counts.
 * Returns { totalRows, sameCount, differentCount, samePct, differentPct, valueStats: [...] }.
 */
export function getCompareStats(sessionId, col1, col2) {
  const session = getSession(sessionId);
  if (!session) return null;
  const headers = session.headers;
  const idx1 = headers.indexOf(col1);
  const idx2 = headers.indexOf(col2);
  if (idx1 === -1 || idx2 === -1) return null;

  const rows = getAllSessionRowsForExport(sessionId);
  const totalRows = rows.length;
  if (totalRows === 0) {
    return {
      totalRows: 0,
      sameCount: 0,
      differentCount: 0,
      samePct: 0,
      differentPct: 0,
      valueStats: [],
    };
  }

  const count1 = Object.create(null);
  const count2 = Object.create(null);
  const samePerValue = Object.create(null); // rows where col1 === col2 === value
  let sameCount = 0;
  let differentCount = 0;

  for (const { data } of rows) {
    const v1 = data[idx1];
    const v2 = data[idx2];
    const n1 = v1 == null || v1 === '' ? null : String(v1).trim();
    const n2 = v2 == null || v2 === '' ? null : String(v2).trim();
    const s1 = n1 ?? '';
    const s2 = n2 ?? '';
    count1[s1] = (count1[s1] || 0) + 1;
    count2[s2] = (count2[s2] || 0) + 1;
    if (s1 === s2) {
      sameCount += 1;
      samePerValue[s1] = (samePerValue[s1] || 0) + 1;
    } else {
      differentCount += 1;
    }
  }

  const allValues = new Set([...Object.keys(count1), ...Object.keys(count2)]);
  const valueStats = [...allValues].sort().map((value) => {
    const c1 = count1[value] || 0;
    const c2 = count2[value] || 0;
    const same = samePerValue[value] || 0;
    // Relative % change: ((col2 - col1) / col1) * 100; null when col1 is 0 (frontend shows "new" or "—")
    const pctChange =
      c1 > 0 ? Math.round(((c2 - c1) / c1) * 1000) / 10 : (c2 > 0 ? null : 0);
    return {
      value: value === '' ? '(blank)' : value,
      col1Count: c1,
      col2Count: c2,
      sameCount: same,
      col1Pct: totalRows ? Math.round((c1 / totalRows) * 1000) / 10 : 0,
      col2Pct: totalRows ? Math.round((c2 / totalRows) * 1000) / 10 : 0,
      samePct: totalRows ? Math.round((same / totalRows) * 1000) / 10 : 0,
      pctChange,
    };
  });

  return {
    totalRows,
    sameCount,
    differentCount,
    samePct: totalRows ? Math.round((sameCount / totalRows) * 1000) / 10 : 0,
    differentPct: totalRows ? Math.round((differentCount / totalRows) * 1000) / 10 : 0,
    valueStats,
  };
}
