# Excel Data Labeller

Web app for chunked editing of large Excel files: upload, choose sheet, configure columns and target options, then let employees claim chunks and edit one row at a time. Export merges all edits with a pre-export integrity check.

## Prerequisites

- **Node.js 18+** — [nodejs.org](https://nodejs.org/)

## Quick start

1. **Clone** the repo.
2. **Setup** — install dependencies:
   ```
   npm run setup
   ```
3. **Start** the server:
   ```
   npm run start
   ```
   Open http://localhost:36001
4. **Stop** when done:
   ```
   npm run stop
   ```

That's it.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run setup` | Install dependencies (server + client). |
| `npm run start` | Start server and frontend. Open http://localhost:36001 |
| `npm run stop` | Stop server and frontend. |
| `npm run status` | Check if server and frontend are running. |
