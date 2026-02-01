---
name: ""
overview: ""
todos: []
isProject: false
---

# Assignee and Tag Export Columns

## Overview

Add optional session config to write assignee and tag (from chunks) into Excel export columns—either new columns appended at the end or existing columns overwritten. User chooses during setup whether to export each, and whether to use an existing column or create a new one.

## Setup (SessionCreate Step 4)

**Per field (Assignee, Tag):**

1. **Needed or not**: User chooses if export is needed for this field.
2. **If needed**: User chooses:
  - **Existing column** — dropdown of sheet headers; overwrite that column on export.
  - **New column** — if not existing, always create new column (text input for name, default "Assignee" / "Tag").

UI options per field:

- Don't export (default for new sessions when user doesn't opt in)
- Export to existing column: [dropdown of headers]
- Export to new column: [text input, default "Assignee" or "Tag"]

## Migration

For existing `session_config` rows (ALTER TABLE with DEFAULTs):

- **Assignee**: `assignee_column = 'Assignee'` (new column at export if not in headers)
- **Tag**: `tag_column = 'Tag'` (new column at export if not in headers)

So existing sessions get assignee and tag export on by default.

## Data Model

Extend `session_config`:

| Column            | Type | Meaning                          |
| ----------------- | ---- | -------------------------------- |
| `assignee_column` | TEXT | Column name; null = don't export |
| `tag_column`      | TEXT | Column name; null = don't export |

**Existing vs new at export**: If the column name exists in headers, overwrite that column; otherwise append as new column. No `*_is_new` fields needed.


## Implementation

### 1. Schema and DB

- [server/src/db/schema.sql](server/src/db/schema.sql) — add 2 columns to `session_config`
- [server/src/db/index.js](server/src/db/index.js) — ALTER TABLE with defaults for migration:
  - `assignee_column TEXT DEFAULT 'Assignee'`
  - `tag_column TEXT DEFAULT 'Tag'`

### 2. Session Service

- [server/src/services/sessionService.js](server/src/services/sessionService.js)
  - Include new fields in `getSessionConfig()`
  - Extend `upsertSessionConfig()` for assignee/tag config
  - Add `getRowToChunkMapping(sessionId)` — map `row_index -> { assignee_name, tag }` from leaf chunks

### 3. Export

- [server/src/routes/export.js](server/src/routes/export.js)
  - Read assignee/tag config; if column set, use `getRowToChunkMapping`
  - For each row: write assignee/tag to configured column. If column name exists in headers, overwrite at that index; else append as new column.

### 4. API

- [server/src/routes/sessions.js](server/src/routes/sessions.js)
  - `PUT /api/sessions/:id/config` accepts `assigneeColumn`, `tagColumn` (null = don't export)

### 5. Frontend — SessionCreate Step 4

- [client/src/pages/SessionCreate.jsx](client/src/pages/SessionCreate.jsx)
  - Assignee section: Don't export | Existing column (dropdown) | New column (input, default "Assignee")
  - Tag section: Don't export | Existing column (dropdown) | New column (input, default "Tag")
  - Only send non-null column names when user opts in

