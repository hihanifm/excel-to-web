import crypto from 'crypto';
import { getDb } from '../db/index.js';

const DEFAULT_DELETE_PIN = 'Samsung12#';

function hashPin(pin) {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

export function createSession(filePath, name = null, originalFilename = null, creatorName = null, deletePin = null) {
  const db = getDb(process.env.DB_PATH);
  const pinToUse = deletePin != null && String(deletePin).trim() !== '' ? String(deletePin).trim() : DEFAULT_DELETE_PIN;
  const pinHash = hashPin(pinToUse);
  const stmt = db.prepare(
    'INSERT INTO sessions (file_path, name, original_filename, creator_name, status, delete_pin) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const result = stmt.run(filePath, name, originalFilename, creatorName, 'draft', pinHash);
  return result.lastInsertRowid;
}

export function deleteSession(sessionId, pin) {
  const db = getDb(process.env.DB_PATH);
  const session = db.prepare('SELECT id, file_path, delete_pin FROM sessions WHERE id = ?').get(sessionId);
  if (!session) return { ok: false, error: 'Session not found' };
  const pinTrimmed = (pin ?? '').trim();
  if (pinTrimmed === '') return { ok: false, error: 'PIN is required to delete' };
  // Sessions with no stored PIN (null/undefined/empty) must match default PIN; others must match stored hash
  const hasStoredPin = typeof session.delete_pin === 'string' && session.delete_pin.length > 0;
  const expectedHash = hasStoredPin ? session.delete_pin : hashPin(DEFAULT_DELETE_PIN);
  const providedHash = hashPin(pinTrimmed);
  if (providedHash !== expectedHash) return { ok: false, error: 'Invalid PIN' };
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  return { ok: true, filePath: session.file_path };
}

/** Delete a draft/configured session without PIN (for abandoning the create wizard). */
export function deleteDraftSession(sessionId) {
  const db = getDb(process.env.DB_PATH);
  const session = db.prepare('SELECT id, file_path, status FROM sessions WHERE id = ?').get(sessionId);
  if (!session) return { ok: false, error: 'Session not found' };
  if (session.status !== 'draft' && session.status !== 'configured') {
    return { ok: false, error: 'Can only abandon draft or configured sessions' };
  }
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  return { ok: true, filePath: session.file_path };
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
    "UPDATE sessions SET sheet_name = ?, headers = ?, total_rows = ?, status = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(sheetName, JSON.stringify(headers), totalRows, status, id);
}

const VALID_SESSION_STATUSES = ['draft', 'configured', 'completed', 'discarded'];

export function updateSessionStatus(sessionId, newStatus) {
  if (!VALID_SESSION_STATUSES.includes(newStatus)) {
    return { ok: false, error: `Invalid status. Must be one of: ${VALID_SESSION_STATUSES.join(', ')}` };
  }
  const db = getDb(process.env.DB_PATH);
  const session = db.prepare('SELECT id, status FROM sessions WHERE id = ?').get(sessionId);
  if (!session) return { ok: false, error: 'Session not found' };
  db.prepare("UPDATE sessions SET status = ?, updated_at = datetime('now') WHERE id = ?").run(newStatus, sessionId);
  return { ok: true };
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
  const parentId = options.parentId ?? null;
  const chunkSizes = Array.isArray(options.chunkSizes) && options.chunkSizes.length > 0
    ? options.chunkSizes.filter((s) => Number(s) > 0).map(Number)
    : [100];
  const start = Math.max(0, rangeStart);
  const end = Math.min(totalRows, rangeEnd);
  const db = getDb(process.env.DB_PATH);
  const stmt = db.prepare(
    'INSERT INTO chunks (session_id, parent_id, chunk_index, start_row, end_row, status) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertAll = db.transaction(() => {
    let cursor = start;
    let chunkIndex = 0;
    while (cursor < end) {
      const sizeIndex = chunkIndex % chunkSizes.length;
      const size = chunkSizes[sizeIndex];
      const chunkEnd = Math.min(cursor + size, end);
      stmt.run(sessionId, parentId, chunkIndex, cursor, chunkEnd, 'unclaimed');
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
    "UPDATE sessions SET chunk_range_start = ?, chunk_range_end = ?, chunk_sizes = ?, updated_at = datetime('now') WHERE id = ?"
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

export function updateSessionConfigOptions(sessionId, { targetOptions }) {
  const db = getDb(process.env.DB_PATH);
  db.prepare(
    'UPDATE session_config SET target_options = ?, reference_column = NULL WHERE session_id = ?'
  ).run(JSON.stringify(targetOptions || []), sessionId);
}

export function listSessions() {
  const db = getDb(process.env.DB_PATH);
  const rows = db.prepare(
    'SELECT id, name, creator_name, file_path, sheet_name, total_rows, chunk_range_start, chunk_range_end, chunk_sizes, created_at, updated_at, status FROM sessions ORDER BY created_at DESC'
  ).all();
  const completionBySession = db.prepare(
    `SELECT session_id, COUNT(*) AS total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
     FROM chunks c WHERE NOT EXISTS (SELECT 1 FROM chunks c2 WHERE c2.parent_id = c.id)
     GROUP BY session_id`
  ).all();
  const rowsEditedBySession = db.prepare(
    `SELECT session_id, COUNT(*) AS c FROM row_edits WHERE user_edited = 1 GROUP BY session_id`
  ).all();
  const completionMap = Object.fromEntries(
    completionBySession.map((r) => [
      Number(r.session_id),
      r.total ? Math.round((Number(r.completed) / Number(r.total)) * 100) : 0,
    ])
  );
  const chunksMap = Object.fromEntries(
    completionBySession.map((r) => [Number(r.session_id), { total: Number(r.total), completed: Number(r.completed) }])
  );
  const rowsEditedMap = Object.fromEntries(rowsEditedBySession.map((r) => [Number(r.session_id), Number(r.c)]));
  return rows.map((r) => {
    const sid = Number(r.id);
    const chunks = chunksMap[sid];
    const totalChunks = chunks?.total ?? 0;
    const rowsEdited = rowsEditedMap[sid] ?? 0;
    const totalRows = r.total_rows != null ? Number(r.total_rows) : 0;
    const recordsCompletionPct = totalRows ? Math.round((rowsEdited / totalRows) * 100) : 0;
    return {
      ...r,
      hasConfig: !!getSessionConfig(r.id),
      completionPct: completionMap[sid] ?? 0,
      totalChunks,
      rowsEdited,
      recordsCompletionPct,
    };
  });
}

/** Leaf chunk = no row has parent_id = this chunk's id. */
function getLeafChunksBySession(db, sessionId) {
  return db.prepare(
    `SELECT id, status FROM chunks c WHERE c.session_id = ? AND NOT EXISTS (SELECT 1 FROM chunks c2 WHERE c2.parent_id = c.id)`
  ).all(sessionId);
}

export function getSessionStats(sessionId) {
  const db = getDb(process.env.DB_PATH);
  const session = getSession(sessionId);
  if (!session) return null;
  const chunks = getLeafChunksBySession(db, sessionId);
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

export function getChunks(sessionId, parentId = null) {
  const db = getDb(process.env.DB_PATH);
  const chunks = db.prepare(
    `SELECT id, parent_id, chunk_index, start_row, end_row, assignee_name, status, completed_at, tag
     FROM chunks WHERE session_id = ? AND ( (? IS NULL AND parent_id IS NULL) OR parent_id = ? )
     ORDER BY chunk_index`
  ).all(sessionId, parentId, parentId);
  const ids = chunks.map((c) => c.id);
  const childCounts = ids.length === 0
    ? {}
    : Object.fromEntries(
        db.prepare(
          `SELECT parent_id as id, COUNT(*) as c FROM chunks WHERE parent_id IN (${ids.map(() => '?').join(',')}) GROUP BY parent_id`
        ).all(...ids).map((r) => [r.id, r.c])
      );
  const rowsEditedCount = ids.length === 0
    ? []
    : db.prepare(
        `SELECT ch.id, COUNT(*) as c FROM chunks ch
         JOIN row_edits re ON re.session_id = ch.session_id AND re.row_index >= ch.start_row AND re.row_index < ch.end_row AND re.user_edited = 1
         WHERE ch.id IN (${ids.map(() => '?').join(',')}) GROUP BY ch.id`
      ).all(...ids);
  const byChunk = Object.fromEntries(rowsEditedCount.map((r) => [r.id, r.c]));
  return chunks.map((c) => ({
    ...c,
    childCount: childCounts[c.id] ?? 0,
    rowsInChunk: c.end_row - c.start_row,
    rowsEditedInChunk: byChunk[c.id] || 0,
  }));
}

export function getChunk(sessionId, chunkId) {
  const db = getDb(process.env.DB_PATH);
  const chunk = db.prepare(
    'SELECT id, parent_id, chunk_index, start_row, end_row, assignee_name, status, completed_at, tag FROM chunks WHERE session_id = ? AND id = ?'
  ).get(sessionId, chunkId);
  if (!chunk) return null;
  const childCount = db.prepare('SELECT COUNT(*) as c FROM chunks WHERE parent_id = ?').get(chunk.id).c;
  const rowsEdited = db.prepare(
    `SELECT COUNT(*) as c FROM row_edits WHERE session_id = ? AND row_index >= ? AND row_index < ? AND user_edited = 1`
  ).get(sessionId, chunk.start_row, chunk.end_row);
  return {
    ...chunk,
    childCount,
    rowsInChunk: chunk.end_row - chunk.start_row,
    rowsEditedInChunk: rowsEdited?.c ?? 0,
  };
}

export function claimChunk(sessionId, chunkId, name) {
  const db = getDb(process.env.DB_PATH);
  const chunk = db.prepare(
    'SELECT * FROM chunks WHERE session_id = ? AND id = ?'
  ).get(sessionId, chunkId);
  if (!chunk) return { ok: false, error: 'Chunk not found' };
  const hasChildren = db.prepare('SELECT 1 FROM chunks WHERE parent_id = ? LIMIT 1').get(chunk.id);
  if (hasChildren) return { ok: false, error: 'Cannot claim a container chunk; open it to claim a leaf' };
  if (chunk.status !== 'unclaimed' && chunk.assignee_name !== name) {
    return { ok: false, error: 'Chunk already claimed by someone else' };
  }
  db.prepare(
    'UPDATE chunks SET assignee_name = ?, claimed_at = datetime(\'now\'), status = ? WHERE id = ?'
  ).run(name, 'in_progress', chunk.id);
  return { ok: true };
}

export function completeChunk(sessionId, chunkId, name) {
  const db = getDb(process.env.DB_PATH);
  const chunk = db.prepare(
    'SELECT * FROM chunks WHERE session_id = ? AND id = ?'
  ).get(sessionId, chunkId);
  if (!chunk) return { ok: false, error: 'Chunk not found' };
  if (chunk.assignee_name !== name) return { ok: false, error: 'Not your chunk' };
  db.prepare(
    'UPDATE chunks SET status = ?, completed_at = datetime(\'now\') WHERE id = ?'
  ).run('completed', chunk.id);
  return { ok: true };
}

export function getChunkRowRange(sessionId, chunkId) {
  const db = getDb(process.env.DB_PATH);
  const chunk = db.prepare(
    'SELECT start_row, end_row FROM chunks WHERE session_id = ? AND id = ?'
  ).get(sessionId, chunkId);
  return chunk ? { startRow: chunk.start_row, endRow: chunk.end_row } : null;
}

export function getChunkAssignee(sessionId, chunkId) {
  const db = getDb(process.env.DB_PATH);
  const chunk = db.prepare(
    'SELECT assignee_name FROM chunks WHERE session_id = ? AND id = ?'
  ).get(sessionId, chunkId);
  return chunk?.assignee_name;
}

export function updateChunkTag(sessionId, chunkId, tag) {
  const db = getDb(process.env.DB_PATH);
  const chunk = db.prepare(
    'SELECT id FROM chunks WHERE session_id = ? AND id = ?'
  ).get(sessionId, chunkId);
  if (!chunk) return { ok: false, error: 'Chunk not found' };
  const tagStr = tag != null ? String(tag) : '';
  db.prepare(
    'UPDATE chunks SET tag = ? WHERE id = ?'
  ).run(tagStr, chunk.id);
  return { ok: true };
}

/** Update assignee name. If chunk has assignee, currentName must match; if chunk has no assignee, currentName must be empty (setting initial assignee). */
export function updateChunkAssignee(sessionId, chunkId, currentName, newName) {
  const db = getDb(process.env.DB_PATH);
  const chunk = db.prepare(
    'SELECT assignee_name FROM chunks WHERE session_id = ? AND id = ?'
  ).get(sessionId, chunkId);
  if (!chunk) return { ok: false, error: 'Chunk not found' };
  const existing = chunk.assignee_name ?? '';
  const current = currentName ?? '';
  if (existing.trim()) {
    if (existing !== current) return { ok: false, error: 'Not your chunk' };
  } else {
    if (current.trim()) return { ok: false, error: 'Not your chunk' };
  }
  const trimmed = (newName ?? '').trim();
  if (!trimmed) return { ok: false, error: 'Name cannot be empty' };
  db.prepare(
    'UPDATE chunks SET assignee_name = ? WHERE id = ?'
  ).run(trimmed, chunk.id);
  return { ok: true };
}

/** Re-chunk a leaf into N children. Chunk must be leaf (no children). Parent retains assignee.
 * Options: chunkSizes (number[]) — processed sizes from frontend; sum must equal range length. */
export function rechunkChunk(sessionId, chunkId, options = {}) {
  const db = getDb(process.env.DB_PATH);
  const chunk = db.prepare(
    'SELECT * FROM chunks WHERE session_id = ? AND id = ?'
  ).get(sessionId, chunkId);
  if (!chunk) return { ok: false, error: 'Chunk not found' };
  const hasChildren = db.prepare('SELECT 1 FROM chunks WHERE parent_id = ? LIMIT 1').get(chunk.id);
  if (hasChildren) return { ok: false, error: 'Only leaf chunks can be re-chunked' };
  const start = chunk.start_row;
  const end = chunk.end_row;
  const rangeLength = end - start;

  const chunkSizes = options.chunkSizes;
  if (!Array.isArray(chunkSizes) || chunkSizes.length === 0) {
    return { ok: false, error: 'chunkSizes (array of sizes) required' };
  }
  const sizes = chunkSizes.filter((s) => Number(s) > 0).map(Number);
  const sum = sizes.reduce((a, b) => a + b, 0);
  if (sum !== rangeLength) {
    return { ok: false, error: `chunkSizes sum (${sum}) must equal chunk range length (${rangeLength})` };
  }

  const stmt = db.prepare(
    'INSERT INTO chunks (session_id, parent_id, chunk_index, start_row, end_row, status) VALUES (?, ?, ?, ?, ?, ?)'
  );
  db.transaction(() => {
    let cursor = start;
    sizes.forEach((size, i) => {
      if (size <= 0) return;
      const chunkEnd = Math.min(cursor + size, end);
      if (chunkEnd <= cursor) return;
      stmt.run(sessionId, chunk.id, i, cursor, chunkEnd, 'unclaimed');
      cursor = chunkEnd;
    });
  })();
  return { ok: true };
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
export function markRowsAsViewed(sessionId, chunkId, name, rowOffsets) {
  const assignee = getChunkAssignee(sessionId, chunkId);
  if (assignee !== name) return { ok: false, error: 'Not your chunk' };
  const range = getChunkRowRange(sessionId, chunkId);
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
