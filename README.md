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

Manual weighting, eligibility, evaluation matrices, TOPSIS rankings, sensitivity previews and saved scenarios, versioned decisions and saved PDF reports are implemented. Manual, AHP and AI-assisted weighting are implemented. Supplier evidence uploads are implemented for synthetic PDF and text documents. The project budget is a planning amount unless a separate mandatory maximum price is enabled. Changes to evaluation inputs invalidate affected approvals, matrices, rankings and decisions while preserving historical reports.

Manual weighting supports saved drafts, two-decimal percentage inputs, equal distribution and explicit approval only at exactly 100%. Only selected scoring criteria receive weights. Changed criteria invalidate prior weight approval and require reassignment. Stale saves are rejected; failed saves keep entries. Approved weights unlock supplier eligibility review.

Supplier eligibility review saves Passed/Pending/Failed determinations and required notes for passed or failed mandatory checks. A configured maximum total price is checked automatically; equality is allowed, and missing price stays Pending. Only fully eligible suppliers count toward the minimum pool of two. With no mandatory requirements or price limit, suppliers qualify without checks. Criteria, supplier or currency changes require affected reviews to be repeated. Saves reject stale edits and support safe retries.

Review decisions are attributed to Demo User (unauthenticated), with a saved timestamp. Evidence documents can be uploaded and retained with historical decisions. Authenticated reviewers and immutable audit history are still pending; SDSS-011 is not fully complete. These demonstration reviews must use synthetic data.

## Set up on another computer

1. Clone this repository. Install Node.js, Python and PostgreSQL client libraries as needed.
2. Run `npm ci` inside `frontend`.
3. Inside `backend`, run `python -m venv .venv`, then `.\.venv\Scripts\python.exe -m pip install -r requirements-lock.txt`.
4. Double-click `Connect cloud database.cmd` and enter your Neon connection strings privately. Alternatively set the backend `DATABASE_URL` environment variable. Never put credentials in frontend settings.
5. Inside `backend`, run `.\.venv\Scripts\python.exe database.py` to apply all versioned storage migrations, including AHP weighting. It is safe to run again.

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
npm.cmd run dev
```

Open http://127.0.0.1:5173. Stop each service with Ctrl+C. The database is hosted in the cloud; the application still runs on your computer.

## Verification

Inside `frontend`:
```powershell
npm.cmd run build
npx.cmd playwright test
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

Each run stores its input matrix, eligible supplier names/IDs, criteria, approved weights, currency and calculation details in an append-only application snapshot. Identical retries reuse a run. Changed inputs mark the previous snapshot stale; it remains readable and must be recalculated before use. This is a demonstration history, not a secured audit ledger: authentication and role permissions remain future work. Sensitivity analysis and human decision recording are available. Migration 7 adds ranking storage. Tests cover a worked symmetric example, preference reversal, ties, zero/degenerate cases, unit scaling, cloud persistence, retry identity, stale snapshots and browser failure recovery.


## Sensitivity analysis

Open Run Sensitivity Analysis from current rankings. Trial weights use the saved baseline matrix, criterion preferences and eligible supplier pool. Weights must total exactly 100%, each between 0 and 100 with at most two decimal places. Run Simulation compares original and scenario ranks and scores, including tied highest-ranked sets. Reset restores baseline weights. Editing weights clears the previous trial result.

Simulations do not write approved weights, ranking runs, supplier data or decisions. Run Simulation previews results without writing a scenario. Save Scenario stores a named, immutable test for the current baseline; previews reset on navigation but saved tests can be reopened. The API rejects outdated or replaced baselines under the project lock, uses the same TOPSIS engine, and rejects degenerate scenarios. Tests verify validation, rank reversal, unchanged approved data, stale baseline rejection, browser retry and reset. Authentication remains unfinished; human final decisions are recorded separately.


## Final purchasing decisions (SDSS-015)

Continue to Final Decision from current rankings. Approve the unique highest-ranked eligible supplier, select an alternative with a required explanation (also used to resolve a highest-score tie), or defer with a required reason and no award. The reviewer must explicitly confirm. Reasons are nonblank text, at most 5,000 characters; no arbitrary minimum word count is imposed.

Migration 8 adds decision storage. Each confirmation atomically stores the calculation snapshot, project details, supplier selection or no award, reasons, version, server-assigned demonstration actor, and time. Rankings and simulation weights are unchanged. Confirmed records are append-only through the API. A deliberate revision requires a revision reason and the current version; previous versions remain visible. Concurrent or stale confirmations are rejected. Repeating the same request identifier returns the original record; changing its content is rejected. Changed evaluation inputs mark the previous decision as needing review, rather than erasing it. Recalculation is required before a new confirmation. Project list workflow statuses and reports are separate backlog tickets.

This is an unauthenticated demonstration, not live purchasing authorization or a tamper-proof audit system. Use synthetic data. Database credentials remain local and excluded from GitHub. Browser tests cover required explanations, retry identity, confirmation locking, revision, deferral and reopening; database tests cover snapshots, eligibility selection, versions, stale inputs and duplicate confirmations.


## Saved decision reports and PDF (SDSS-016)

From a confirmed decision choose View Decision Report, then Download PDF. History entries open the report for that exact version, including older approvals and deferrals. Reports contain saved project/commercial inputs, recommendation, chosen supplier or no award, justification, weights, preferences, supplier scores, reviewer/time and calculation/decision identifiers. Both screen and PDF use the same report projection. Report generation reads only the saved decision row; it never recalculates or substitutes current project, supplier, criteria or review drafts. A report is a historical record, not proof that the version is still current.

New confirmations additionally capture eligibility configuration, eligible supplier review details, weighting method and project reference. Existing records are left intact: missing review details or weighting provenance are explicitly identified. Future confirmations capture saved scenarios for the exact ranking baseline. Older reports remain unchanged and identify when no scenario findings were saved.

PDF export uses ReportLab 4.4.10 and bundled Noto Sans fonts under the SIL Open Font License (backend/assets/fonts/OFL.txt). Tables repeat their headings across pages; long notes wrap and paginate. Confirmation times display in UTC consistently. Latin, Greek and Cyrillic text are supported by these fonts. If other characters cannot be represented, export returns a readable error instead of silently producing incorrect names; the browser report remains available. Downloaded PDFs can be printed using a PDF viewer.

Install updated dependencies with the backend virtual environment using python -m pip install -r requirements-lock.txt, then restart the backend to load report routes. Tests cover recommended/alternative/deferred reports, PDF text matching, escaped markup, Cyrillic text, missing historical details, long-table pagination, unsupported-character handling, project isolation, failed-download recovery and version navigation. The isolated cloud decision test verifies that saved reports remain identical after supplier edits and decision revisions.


## Integration verification (SDSS-017, partial)

The manual journey has an isolated cloud acceptance test: test_manual_journey.py. It creates its own schema, applies migrations twice, creates a synthetic project and three suppliers, requires weight approval, checks pending eligibility, passes two suppliers and fails one, rejects an incomplete matrix, calculates TOPSIS, runs a sensitivity scenario without changing the baseline, confirms a human decision and downloads its PDF. It then changes an eligibility review and verifies stale ranking/decision warnings while the saved report remains unchanged. A cross-project report request is rejected. The schema is removed in a finally block; the user's demonstration project is not edited.

Component browser tests cover the individual pages with mocked APIs; they are not a full browser journey against Neon. This verification does not complete SDSS-017: AHP, AI weighting, file uploads, broader accessibility/viewport review and recovery/deployment checks remain. See docs/manual-workflow-verification.md for the current acceptance record and release gaps.


## AHP pairwise weighting (SDSS-009)

Choose Use AHP Pairwise Weighting from saved criteria or the manual-weighting page. For n selected criteria, answer n(n-1)/2 comparisons using integers 1–9 or exact reciprocal codes 1/2–1/9. First/second labels follow the table columns. Mandatory checks receive no weight. Empty comparisons remain unanswered; they are not assumed equal. Drafts and the latest 20 saved comparison versions can be reopened. Calculation previews do not write active weights.

Policy: use the positive reciprocal matrix, diagonal 1, and principal right eigenvector (power iteration, Decimal precision 50, maximum 10,000 iterations, convergence delta below 1e-35). Lambda max is the mean of (Aw)i/wi. CI = max(0, (lambda max - n)/(n-1)); CR = CI/RI. For n=2, CR=0 because a reciprocal two-criterion matrix is always consistent. Approval requires every comparison and unrounded CR <= 0.10. A low CR measures internal agreement, not correctness of priorities.

RI values for n=2..15: 0, 0.58, 0.90, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49, 1.51, 1.48, 1.56, 1.57, 1.59. AHP supports up to 15 scoring criteria because this implementation uses that published RI table; manual weighting still supports 20. Definitions follow [Saaty, 2008](https://doi.org/10.1504/IJSSCI.2008.017590), with consistency/RI variations discussed in [Consistency Improvement in the Analytic Hierarchy Process, 2024](https://www.mdpi.com/2227-7390/12/6/828). RI tables differ between publications, so the exact values above are part of the stored calculation policy.

Applied weights use largest-remainder allocation to 10,000 percentage basis points and therefore total exactly 100.00%. Fractional remainders are quantized at 1e-25 before ordering to make arithmetic-noise ties deterministic; criterion order breaks equal remainders. TOPSIS uses these approved two-decimal percentages. CR uses the unrounded eigenvector, not the rounded weights.

Migration 9 adds AHP drafts, append-only comparison versions, and weighting method/provenance. Saving or previewing an AHP draft while manual weighting is active leaves manual weights unchanged. Approving AHP atomically publishes its weights and provenance; a saved edit to active AHP removes its approval. Manual saves explicitly switch the source back to manual. Criteria and weight revision checks protect concurrent changes; repeated identical submissions do not create duplicate comparison versions. Changed weight versions invalidate affected matrices, rankings and current decisions. Historical reports remain unchanged. Eligibility return navigation follows the active weighting method.

New confirmed decisions capture AHP judgments and diagnostics in their snapshot; both report screen and PDF identify the AHP method and show consistency diagnostics. Existing approvals are not retroactively altered. Verification includes consistent ratio weights, an independently solvable inconsistent cyclic matrix, reciprocity, exact totals, two-criterion and 15-criterion cases, unrounded threshold boundaries, invalid inputs, API persistence/retries/conflicts, method switches, history, criteria invalidation, downstream reports and browser failure recovery. Authentication and AI suggestions remain separate work.


## Private Cloudflare AI connection (setup only)

Double-click Connect AI service.cmd in the repository root. Paste the Cloudflare Account ID and Workers AI token directly into the desktop dialog; the token field is masked. Connect and save sends one short connection-test message to Cloudflare, using a maximum of eight generated tokens. No project, supplier, evidence or purchasing data is sent by this test.

The configured model is @cf/meta/llama-3.3-70b-instruct-fp8-fast. The dialog saves verified credentials atomically in backend/ai.local.json, excluded from Git together with temporary settings files. Credentials are local plaintext; do not share the file. Failed verification preserves existing settings. Connection errors do not echo credentials or provider response bodies. CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN can alternatively be supplied as backend environment variables.

The private connection helper is implemented and was verified by the user. AI weighting screens, strict validation, provenance storage and explicit human approval are implemented below. Connecting this helper alone does not change active Manual/AHP weights.

References: [Cloudflare REST API setup](https://developers.cloudflare.com/workers-ai/get-started/rest-api/), [configured model](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/). Cloudflare free allowances and available models can change; stay on the Free plan for this demonstration.


## AI weight suggestions (SDSS-010)

Open Use AI Weight Suggestions from saved criteria or manual/AHP weighting. Enter synthetic purchasing priorities, inspect the outbound context and explicitly consent before Request AI Suggestion. Only the category, selected criterion IDs/names/units/preferences and these priority notes are sent. Supplier records, quotations, evidence, budget and project description are excluded. Suggestions are advisory, not supplier recommendations.

Cloudflare Workers AI uses @cf/meta/llama-3.3-70b-instruct-fp8-fast. The backend accepts Cloudflare response text or a structured JSON response object, then strictly validates the model result: exact selected IDs, finite 0..100 percentages with at most two decimal places, total exactly 100.00%, nonempty explanations for every criterion, a nonempty summary and no extra schema fields or duplicate keys. Invalid, timed-out, unavailable and quota-limited responses return an actionable error while retaining saved work. No fabricated fallback suggestions or automatic approval are used. Manual and AHP alternatives remain available.

Migration 10 adds immutable AI suggestions, editable drafts, append-only draft/approval versions and the AI weighting source. Network generation runs outside project transactions; context and draft revision are rechecked afterwards. Successful requests are idempotent by request ID. A suggestion request stores an unapproved draft but leaves current approved weights alone. Users can adjust weights, add review notes and explicitly approve at exactly 100%. Editing and saving a currently approved AI draft removes its approval; exploring a new suggestion does not replace older active weights until approval. Switching methods checks the shared weight revision and invalidates affected calculations. Changes to category or criteria make AI context stale. Saved decision reports remain historical snapshots.

New confirmed decisions record provider/model, transmitted priorities/context, original weights/explanations, applied weights, review notes and the demonstration reviewer. Screen and PDF reports distinguish original suggestions from approved values. Secrets stay in the ignored local settings file and are never returned by application APIs. This remains an unauthenticated synthetic-data demonstration.

Verification: strict output/schema tests, context allowlist checks, structured-provider-response regression, browser consent/unavailable retry/edits/total gate/approval/reload, and an isolated Neon API journey covering method switches, draft history, cross-project ownership, stale/concurrent requests, released network locks and report stability. A live Cloudflare request using synthetic two-criterion context returned a validated suggestion. AHP and the user's saved project/decision were not changed by verification. Restart the backend after migrating to load the new routes.


## Dashboard and derived project statuses (SDSS-018)

Dashboard now reads saved projects, approved/deferred/needs-review totals and project-scoped supplier-entry counts. Count cards and workflow buttons open the corresponding filtered project list. Recent activity shows up to six projects with Continue Workflow and, where a saved decision exists, Saved Report. The overview has an explicit refresh action; it is a loaded snapshot, not a push-updated monitor. Failed loads show an unavailable state rather than invented zero totals.

Project lists support search by name/reference/category, status filtering, clear/reset, refresh, six-row pagination, details and Continue Workflow. Workflow statuses are Draft, In progress, Ready to evaluate, Evaluated, Approved, Deferred and Needs review. They are derived from current suppliers, criteria, approved weighting method/context, eligibility reviews, matrix readiness and the latest calculation/decision. An approved or deferred decision counts as current only when its calculation snapshot is still current. Changes needing reapproval or recalculation show Needs review, with a link to the earliest required stage. Saved reports remain historical and accessible.

The project-list API adds workflow_status, workflow_stage, resume_path, last_activity_at and decision_id; the legacy stored status field remains Draft for compatibility. Last activity includes calculation and decision timestamps without changing the project-edit concurrency timestamp. Bulk reads use one repeatable-read, read-only transaction and share matrix-context hashing and eligibility validation with calculation endpoints. They do not acquire project write locks, call AI providers or recalculate TOPSIS. No migration is needed.

Verification covers pure workflow states, AI/category and supplier invalidation, cloud manual/decision journeys including deferral, and browser count/filter/search/pagination/resume/unavailable-state recovery. Global supplier, evaluation, report-list and settings navigation remain visibly disabled; project-scoped features remain reachable from the workflow. This does not complete the remaining release checks.


## Supplier evidence documents

Apply migration 11 with the backend migration command before using uploads. In a supplier eligibility review, choose a synthetic PDF or UTF-8 text file, optionally associate it with a mandatory check, and click Upload. Selecting a file alone does not upload it. Files save immediately; cancelling the review discards unsaved review notes, not uploaded files. A synthetic text example is available in the upload panel.

Limits are 2 MiB per file, 1–50 pages for unencrypted PDFs, ten active documents per supplier, and 20 MiB / 100 retained documents per project. Format validation is not malware scanning. Use synthetic documents only: this local demonstration has no authentication or reviewer access controls. Files are stored in the configured cloud PostgreSQL database, not in Git; contents are never sent to the AI weighting service.

Upload and removal advance the supplier evidence version. Existing mandatory-check reviews must be reviewed and saved again against that version; an upload never passes a requirement automatically. With no mandatory requirements, general attachments do not disqualify suppliers. Removal archives documents, so historical decision downloads remain available, including after a supplier is removed. Retained files count toward project limits. Reports capture attachment identity, size, hash and review context without embedding file content; older reports identify missing historical attachment metadata.

Verification includes isolated cloud storage, upload retries, stale-version rejection, review invalidation, historical downloads after removal, quota enforcement and PDF metadata, plus browser upload/retry/download/removal checks.


## Saved sensitivity scenarios

Migration 12 adds immutable sensitivity_scenarios records. Run Simulation is still a preview. Supply a scenario name and optional notes, then Save Scenario to retain the tested weights and server-calculated result. Up to 20 tests can be saved for each ranking baseline. Save retries reuse an identifier; changed requests with the same identifier are rejected. Saving changes neither approved weights nor baseline rankings, and does not alter an existing decision.

Saved tests are listed only for their exact baseline. Changed evaluation inputs block new saves until rankings are recalculated. Historical tests stay stored; future confirmations include all saved scenarios for the confirmed baseline as an immutable snapshot, with names, notes, actor, timestamp, weights, ranks and scores in web/PDF reports. Later saves require a new decision revision to appear in its report. These selected scenarios are not a proof of stability for all possible weights. No AI service is called.
