# excel-to-web — Initial plan

## Overview
Web app to upload Excel files, configure columns and target options, then process/label data in chunks (e.g. for annotation or review).

## Core flow
1. **Upload** — User uploads an `.xlsx` file; server stores it and creates a session.
2. **Sheet selection** — User picks a sheet; server parses headers and rows in batches, stores in DB.
3. **Config** — User selects left (context) columns, target column, and target options.
4. **Chunks** — Data split into chunks; assignees claim and complete chunks (row-level target edits).
5. **Export** — Combine row edits with original data and export (e.g. Excel/CSV).

## Tech
- **Server**: Node (ExcelJS, SQLite).
- **DB**: Sessions, session_config, session_rows, chunks, row_edits (see `server/src/db/schema.sql`).
- **Client**: TBD (e.g. React/Vue or simple HTML/JS).

## Status
- [x] DB schema
- [x] Excel service (sheet names, parse in batches)
- [ ] API routes (upload, sheets, config, chunks, edits, export)
- [ ] Client UI
- [ ] Auth / assignee handling (if needed)
