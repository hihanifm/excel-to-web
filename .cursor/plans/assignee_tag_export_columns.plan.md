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

- **Assignee**: enabled, new column — `assignee_column = 'Assignee'`, `assignee_column_is_new = 1`
- **Tag**: enabled, new column — `tag_column = 'Tag'`, `tag_column_is_new = 1`

So existing sessions get assignee and tag export on by default, using new columns.

## Data Model

Extend `session_config`:


| Column                   | Type    | Meaning                          |
| ------------------------ | ------- | -------------------------------- |
| `assignee_column`        | TEXT    | Column name; null = don't export |
| `assignee_column_is_new` | INTEGER | 0 = existing, 1 = new            |
| `tag_column`             | TEXT    | Column name; null = don't export |
| `tag_column_is_new`      | INTEGER | 0 = existing, 1 = new            |


## Implementation

### 1. Schema and DB

- [server/src/db/schema.sql](server/src/db/schema.sql) — add 4 columns to `session_config`
- [server/src/db/index.js](server/src/db/index.js) — ALTER TABLE with defaults for migration:
  - `assignee_column TEXT DEFAULT 'Assignee'`
  - `assignee_column_is_new INTEGER DEFAULT 1`
  - `tag_column TEXT DEFAULT 'Tag'`
  - `tag_column_is_new INTEGER DEFAULT 1`

### 2. Session Service

- [server/src/services/sessionService.js](server/src/services/sessionService.js)
  - Include new fields in `getSessionConfig()`
  - Extend `upsertSessionConfig()` for assignee/tag config
  - Add `getRowToChunkMapping(sessionId)` — map `row_index -> { assignee_name, tag }` from leaf chunks

### 3. Export

- [server/src/routes/export.js](server/src/routes/export.js)
  - Read assignee/tag config; if column set, use `getRowToChunkMapping`
  - For each row: write assignee/tag to configured column (existing or new), same pattern as target column

### 4. API

- [server/src/routes/sessions.js](server/src/routes/sessions.js)
  - `PUT /api/sessions/:id/config` accepts `assigneeColumn`, `assigneeColumnIsNew`, `tagColumn`, `tagColumnIsNew` (null = don't export)

### 5. Frontend — SessionCreate Step 4

- [client/src/pages/SessionCreate.jsx](client/src/pages/SessionCreate.jsx)
  - Assignee section: Don't export | Existing column (dropdown) | New column (input, default "Assignee")
  - Tag section: Don't export | Existing column (dropdown) | New column (input, default "Tag")
  - Only send non-null column names when user opts in

