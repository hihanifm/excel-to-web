# Excel Chunked Web App

Web app for chunked editing of large Excel files: upload, choose sheet, configure columns and target options, then let employees claim chunks and edit one row at a time (or N rows). Export merges all edits with a pre-export integrity check.

## Stack

- **Backend:** Node.js, Express, SQLite (better-sqlite3), ExcelJS, multer
- **Frontend:** React, Vite, React Router

## Setup

### Backend

```bash
cd server
npm install
cp .env.example .env   # optional: set PORT, DB_PATH, EXCEL_BATCH_SIZE
```

### Frontend

```bash
cd client
npm install
npm run build
```

## Run (scripts from project root)

Ports: **backend 36000**, **frontend dev 36001**.

| Script   | Description |
|----------|-------------|
| `npm run setup` | Install dependencies (server + client). |
| `npm run start` | Start both in background (dev: backend 36000 + frontend 36001). Open http://localhost:36001 |
| `npm run start -- -p` | Start prod (backend only on 36000, serves built client). Open http://localhost:36000 |
| `npm run stop`  | Stop backend and frontend (kill processes on 36000 and 36001). |
| `npm run status`| Show whether backend and frontend are running. |

### Development (default)

```bash
npm run setup   # once
npm run start   # starts backend + frontend in background
# Open http://localhost:36001
npm run stop    # when done
```

### Production (-p)

```bash
npm run start -- -p   # builds client if needed, starts backend only on 36000
# Open http://localhost:36000
npm run stop
```

### Manual / PM2 (Linux)

- Dev: `cd server && PORT=36000 npm run dev` and `cd client && npm run dev` (frontend uses 36001).
- Prod: `cd server && PORT=36000 npm start` (serves client/dist).
- PM2: set `PORT=36000` in ecosystem.config.cjs env, then `pm2 start ecosystem.config.cjs`.

## Env (server)

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Server port |
| DB_PATH | ./data/excel-app.db | SQLite database path |
| EXCEL_BATCH_SIZE | 500 | Rows per batch when parsing/inserting |

## Data

- **DB:** SQLite at `server/data/excel-app.db` (create `server/data` if needed)
- **Uploads:** Stored under `server/data/uploads/`
- Back up the `.db` file regularly for long-lived sessions.
