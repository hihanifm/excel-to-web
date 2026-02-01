# Excel Data Labeller

Web app for chunked editing of large Excel files: upload, choose sheet, configure columns and target options, then let employees claim chunks and edit one row at a time (or N rows). Export merges all edits with a pre-export integrity check. **Version** is maintained in the root `VERSION` file; scripts and the UI read from there.

## Stack

- **Backend:** Node.js, Express, SQLite (better-sqlite3), ExcelJS, multer
- **Frontend:** React, Vite, React Router

## Sample data

A sample Excel file with 150 rows is in `samples/sample.xlsx` (columns: ID, Name, Department, Status, Date, Notes). To regenerate or create another:

```bash
cd server && node scripts/generate-sample.js
```
Output goes to `samples/sample.xlsx`.

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

### Docker (Linux)

Single process in the container: backend serves the built frontend on port 3000.

```bash
# Build and run with Docker
docker build -t excel-to-web .
docker run -p 3000:3000 -v excel-data:/app/server/data excel-to-web
# Open http://localhost:3000
```

Or with Docker Compose (persists db and uploads in a volume):

```bash
docker compose up -d --build
# Open http://localhost:3000
docker compose down   # stop; data kept in volume excel-data
```

### Manual / PM2 (Linux)

- Dev: `npm run start` (backend 36000 + frontend 36001).
- Prod: `./scripts/start.sh -p` (single process, serves client/dist).
- PM2 (auto-restart on crash): `./scripts/start.sh --pm2`. Then for start on boot: `./scripts/pm2-startup.sh` and run the command PM2 outputs.

## Env (server)

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Server port |
| DB_PATH | ./data/excel-app.db | SQLite database path |
| EXCEL_BATCH_SIZE | 500 | Rows per batch when parsing/inserting |
| PRELOADED_FILES_DIR | ~/.excel_data_labelling/files | Folder of preloaded Excel files (optional) |

## Preloaded files

You can place `.xlsx` or `.xls` files in the preloaded folder (default `~/.excel_data_labelling/files/`) and choose them when creating a project or comparing columns, without uploading. Override the folder with `PRELOADED_FILES_DIR` if needed.

## Data

- **DB:** SQLite at `server/data/excel-app.db` (create `server/data` if needed)
- **Uploads:** Stored under `server/data/uploads/`
- **Backup:** `./scripts/backup-db.sh` backs up the DB to `server/data/backups/`.
  - `--keep N` – retain only last N backups (count)
  - `--retain-days N` – delete backups older than N days (duration)
  - `--every-hours N` – only backup if last backup ≥N hours ago AND DB changed (for cron)
  - **Add to cron:** `./scripts/backup-cron-setup.sh` (or `npm run backup-cron-setup`) – adds cron job in one command
