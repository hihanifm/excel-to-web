-- Sessions: one per uploaded file; after step 2 sheet is parsed and rows stored
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  creator_name TEXT,
  file_path TEXT NOT NULL,
  original_filename TEXT,
  sheet_name TEXT,
  headers TEXT NOT NULL DEFAULT '[]',
  total_rows INTEGER,
  chunk_range_start INTEGER NOT NULL DEFAULT 0,
  chunk_range_end INTEGER,
  chunk_sizes TEXT NOT NULL DEFAULT '[100]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'draft',
  delete_pin TEXT
);

-- Session config: left columns, target column, target options, reference column for pre-fill (after step 3 & 4)
CREATE TABLE IF NOT EXISTS session_config (
  session_id INTEGER PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  left_columns TEXT NOT NULL DEFAULT '[]',
  target_column TEXT NOT NULL,
  target_column_is_new INTEGER NOT NULL DEFAULT 0,
  target_options TEXT NOT NULL DEFAULT '[]',
  reference_column TEXT
);

-- One row per data row; data = JSON array of cell values in header order
CREATE TABLE IF NOT EXISTS session_rows (
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (session_id, row_index)
);

-- Chunks: derived from session chunk range + chunk_sizes
CREATE TABLE IF NOT EXISTS chunks (
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  start_row INTEGER NOT NULL,
  end_row INTEGER NOT NULL,
  assignee_name TEXT,
  claimed_at TEXT,
  status TEXT NOT NULL DEFAULT 'unclaimed',
  completed_at TEXT,
  tag TEXT,
  PRIMARY KEY (session_id, chunk_index)
);

-- Row-level edits: only target column updated; user_edited=1 when user changed it, 0 when pre-populated
CREATE TABLE IF NOT EXISTS row_edits (
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  target_value TEXT NOT NULL,
  user_edited INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (session_id, row_index)
);

CREATE INDEX IF NOT EXISTS idx_session_rows_session ON session_rows(session_id);
CREATE INDEX IF NOT EXISTS idx_row_edits_session ON row_edits(session_id);
