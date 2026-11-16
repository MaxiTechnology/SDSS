# Supplier Decision Support System (SDSS)

University project under active development, based on the SDSS Figma prototype. React and TypeScript frontend, Python/FastAPI backend, PostgreSQL hosted on Neon. Use synthetic demonstration data only. This local demonstration has no login yet; do not expose the API publicly.

## Current implementation

- Create a purchasing project with a required name and currency; category, estimated budget, target date and description are optional.
- Save project details as a Draft in PostgreSQL, with a generated project reference.
- Search the saved project list and reopen details, including after a page refresh.
- Edit saved project details or cancel without saving. Currency changes keep the budget number unchanged and show a review reminder.
- Detect stale edits from another window and preserve unsaved entries instead of overwriting newer changes.
- Validate entries and retain form values when saving fails. Retrying the same save does not create a duplicate.

Add, edit and remove suppliers within a saved project, with required names and optional location/description. Records persist in Neon; failed saves keep entries, stale updates are rejected, and discarding unsaved changes requires confirmation. The API requires at least two saved suppliers for readiness.

Choose and configure scoring criteria after saving at least two suppliers. Five defaults are provided; custom criteria support units, higher/lower preferences and optional ranges. At least two criteria must be selected, with a maximum of 20. Separate mandatory requirements and an optional maximum price can be saved. Criteria persist with revision checks to protect newer edits and retain entries on failed saves.

AI/AHP weighting, eligibility enforcement, TOPSIS, sensitivity, approvals and reports remain future tickets. Mandatory requirements and maximum price are configuration only until eligibility is implemented. The project budget remains a planning amount. Supplier changes update the project timestamp; criteria revisions will support result invalidation when calculation results exist.

Manual weighting supports saved drafts, two-decimal percentage inputs, equal distribution and explicit approval only at exactly 100%. Only selected scoring criteria receive weights. Changed criteria invalidate prior weight approval and require reassignment. Stale saves are rejected; failed saves keep entries. Later evaluation stages remain unavailable.

## Set up on another computer

1. Clone this repository. Install Node.js, Python and PostgreSQL client libraries as needed.
2. Run `npm ci` inside `frontend`.
3. Inside `backend`, run `python -m venv .venv`, then `.\.venv\Scripts\python.exe -m pip install -r requirements-lock.txt`.
4. Double-click `Connect cloud database.cmd` and enter your Neon connection strings privately. Alternatively set the backend `DATABASE_URL` environment variable. Never put credentials in frontend settings.
5. Inside `backend`, run `.\.venv\Scripts\python.exe database.py` to apply the versioned project, supplier, criteria and manual-weight storage migrations. It is safe to run again.

Database setup utilities only verify and save the connection. The separate migration command creates application tables. Existing data is preserved.

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

Open http://127.0.0.1:5173. Stop each service with Ctrl+C. The database is hosted in the cloud; the application still runs on your computer.

## Verification

Inside `frontend`:
```powershell
npm run build
npx playwright test
```
The browser test uses installed Google Chrome and a mocked API to check validation, failure recovery, retry identity, search, reopening after refresh, editing, cancellation and failed-update recovery, supplier counts from empty to three, supplier editing/removal, cancellation and reopening. Criteria checks cover configuration, custom criteria, mandatory checks, ranges, failed-save recovery, persistence after refresh and the minimum selection gate.

Inside `backend`:
```powershell
.\.venv\Scripts\python.exe -m pytest -q
```
To include the real database persistence test:
```powershell
$env:SDSS_RUN_DATABASE_TESTS='1'
.\.venv\Scripts\python.exe -m pytest -q
```
The integration test creates a uniquely named test schema and removes only that schema afterwards. It verifies migration repetition, storage, retrieval, validation, duplicate-save handling, updates, safe update retries and stale-edit protection, project isolation, supplier persistence and the two-supplier readiness gate, criteria persistence, revision conflicts and configuration validation. The database role must have schema creation permission.

Tested runtime: Node 26.13.0, npm 11.20.0, Python 3.15.2 on Windows. Dependency lock files record resolved package versions. On Windows database access uses the installed PostgreSQL 18 client library under `C:/Program Files/PostgreSQL/18/bin` when available.

## Secrets and review workflow

`backend/database.local.json` contains private credentials and is excluded from Git, together with environment files, dependencies and build/test output. Each developer configures their own connection. Never upload this settings file.

Trello tracks implementation tickets. Figma is the design reference. The implemented project screen references are `33:13004` and `33:11588` in the SDSS Figma file. SVG icons are exported design assets.

Supplier screens follow the existing application layout and supplied screenshots. Exact Figma visual verification remains pending because design-file access was unavailable. SDSS-006 is implemented for supplier records; downstream result invalidation depends on the later calculation tickets.
