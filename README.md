# Supplier Decision Support System (SDSS)

University project under active development, based on the SDSS Figma prototype. The frontend uses React and TypeScript; the backend uses Python and FastAPI. PostgreSQL is hosted on Neon. Only synthetic demonstration data should be used at this stage.

## Current implementation

The starter page checks connectivity to the application service. Private setup utilities verify database connections. Project saving, supplier evaluation, AHP, TOPSIS, sensitivity analysis, decisions, and reports are planned and are not implemented yet. The application service does not yet use the saved database configuration.

## Start

Open two PowerShell windows in this folder.

First window:
```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 8000
```

Second window:
```powershell
cd frontend
npm run dev
```

Open http://127.0.0.1:5173. The page should say “Application service connected”. Stop each service with Ctrl+C.

## Reinstall dependencies

Frontend: run `npm ci` inside frontend. Backend: run `python -m venv .venv`, then `.\.venv\Scripts\python.exe -m pip install -r requirements-lock.txt` inside backend.

## Verification

Frontend: `npm run build`. Backend: `.\.venv\Scripts\python.exe -m pytest -q`.

Tested runtime: Node 26.13.0, npm 11.20.0, Python 3.15.2 on Windows. Resolved frontend versions are recorded in package-lock.json and backend versions in requirements-lock.txt.

Never store passwords in source files. Local database settings, environment files, installed dependencies, and build output are excluded from source control. Each developer must configure their own database connection.

## Private database setup

For Neon, double-click `Connect cloud database.cmd` and paste the connection strings into the hidden field. For local PostgreSQL, use `Configure database.cmd` and enter the sdss_app password. Both tools verify the connection before saving `backend/database.local.json`. This file contains credentials: never upload or share it. Setup does not create tables or change project records.

On Windows the setup utilities use the PostgreSQL 18 client library installed under `C:/Program Files/PostgreSQL/18/bin` when available.

## Review and development workflow

Implementation tasks are tracked on the SDSS implementation Trello board. Work is verified one task at a time. This repository contains application source and dependency lock files; Figma remains the design reference. Cloud database hosting is separate from application hosting: the application currently runs locally.
