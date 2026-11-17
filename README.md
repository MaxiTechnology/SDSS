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

AI/AHP weighting, sensitivity, final decisions and reports remain future tickets. The project budget remains a planning amount. Supplier changes update the project timestamp; criteria revisions will support result invalidation when calculation results exist.

Manual weighting supports saved drafts, two-decimal percentage inputs, equal distribution and explicit approval only at exactly 100%. Only selected scoring criteria receive weights. Changed criteria invalidate prior weight approval and require reassignment. Stale saves are rejected; failed saves keep entries. Approved weights unlock supplier eligibility review.

Supplier eligibility review saves Passed/Pending/Failed determinations and required notes for passed or failed mandatory checks. A configured maximum total price is checked automatically; equality is allowed, and missing price stays Pending. Only fully eligible suppliers count toward the minimum pool of two. With no mandatory requirements or price limit, suppliers qualify without checks. Criteria, supplier or currency changes require affected reviews to be repeated. Saves reject stale edits and support safe retries.

Review decisions are attributed to Demo User (unauthenticated), with a saved timestamp. Document uploads, authenticated reviewers, and immutable audit history are still pending; SDSS-011 is not fully complete. These demonstration reviews must use synthetic data.

## Set up on another computer

1. Clone this repository. Install Node.js, Python and PostgreSQL client libraries as needed.
2. Run `npm ci` inside `frontend`.
3. Inside `backend`, run `python -m venv .venv`, then `.\.venv\Scripts\python.exe -m pip install -r requirements-lock.txt`.
4. Double-click `Connect cloud database.cmd` and enter your Neon connection strings privately. Alternatively set the backend `DATABASE_URL` environment variable. Never put credentials in frontend settings.
5. Inside `backend`, run `.\.venv\Scripts\python.exe database.py` to apply the versioned project, supplier, criteria, manual-weight eligibility-review and evaluation-matrix storage migrations. It is safe to run again.

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

Eligibility verification covers cancellation, required review notes, failed-save recovery and reopening after refresh. Isolated database checks cover approval gating, pass/fail/pending derivation, exact price limits, safe retries, revision conflicts, project isolation and review invalidation.

Evaluation matrix entry supports eligible suppliers and selected scoring criteria, units, configured ranges, saved incomplete drafts, failed-save recovery and revision conflicts. Changed eligibility, suppliers, criteria, currency or weights require matrix review. Complete entries unlock TOPSIS calculation. Browser checks cover invalid ranges, save failures and reopening; isolated database checks cover drafts, persistence, safe retries, stale context and project isolation.

## TOPSIS rankings

Calculate Rankings uses only a complete, current saved matrix and approved weights. Each column is divided by its Euclidean norm, multiplied by its approved percentage weight, then compared with cost/benefit ideal best and worst values. Scores are distance-to-worst / (distance-to-best + distance-to-worst). The algorithm follows the vector-normalized TOPSIS sequence described in https://doi.org/10.1016/J.DAJOUR.2021.100021 .

Policy: calculations use 50-digit Decimal arithmetic. Sort by unrounded scores; show six decimal places. Exact calculated ties share a competition rank (1, 1, 3), with supplier ID used only for stable display order. A tied highest score has no single recommendation. All-zero columns and completely indistinguishable weighted datasets block calculation with a review message; constant nonzero columns contribute zero distance. No prototype scores are hardcoded.

Each run stores its input matrix, eligible supplier names/IDs, criteria, approved weights, currency and calculation details in an append-only application snapshot. Identical retries reuse a run. Changed inputs mark the previous snapshot stale; it remains readable and must be recalculated before use. This is a demonstration history, not a secured audit ledger: authentication, role permissions and final decision approval remain future work. Sensitivity and final decisions are not yet available. Migration 7 adds ranking storage. Tests cover a worked symmetric example, preference reversal, ties, zero/degenerate cases, unit scaling, cloud persistence, retry identity, stale snapshots and browser failure recovery.
