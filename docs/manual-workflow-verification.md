# Manual workflow verification - 2026-11-18

Scope: Release 1 synthetic-data demonstration, manual percentage weighting. This is not a declaration of live procurement readiness.

## User-observed acceptance

- The user restarted backend and frontend locally and reopened the saved project.
- APPLE CAFE was approved as decision version 1 and remained visible after refresh.
- A two-page PDF downloaded and opened in Chrome. Screenshots at 100% show the saved approval, ranking, weights, values, and explicit historical-data limitations.
- Decision confirmation checkbox layout was corrected to place an ordinary-sized checkbox beside its label.

## Automated evidence

- Backend suite: 36 passed; five opt-in database tests skipped in the default run.
- Ten browser tests exercise individual pages with mocked API responses, including decisions and PDF download retry.
- A separate opt-in cloud manual-journey test uses a unique temporary schema and real API/database operations. It verifies project persistence, migrations twice, weight approval gating, pending/failed supplier exclusion, a complete matrix, TOPSIS, a temporary sensitivity scenario, decision approval, report/PDF generation, cross-project report isolation and invalidation after a review changes. Historical report content must remain identical.
- Prior decision/report integration checks cover alternative approval, required reasons, deferral with no award, append-only revisions, confirmation retries and saved report stability.

The API journey and browser page checks complement each other. There is no claim of an uninterrupted automated browser journey against cloud storage.

## Remaining work

- SDSS-009: AHP comparisons, diagnostics, persistence, approval and saved version history were added after the manual acceptance check. Separate tests verify the AHP path. The user completed the 40/20/20/10/10 comparison example, approved it, recalculated rankings, confirmed decision version 2 and downloaded its AHP report. CR display and pagination were subsequently refined.
- SDSS-010: AI suggestion generation, strict validation, adjustment, provenance/history and explicit approval are implemented. The user verified Cloudflare setup; a live synthetic suggestion and isolated API/browser checks passed. The user completed AI approval, decision version 3 and its PDF report. Manual and AHP fallback work.
- SDSS-011: PDF/text upload, retained cloud storage, version-bound reviews and historical downloads are implemented. Authenticated access scope remains pending; use synthetic documents only.
- SDSS-014: named scenario persistence and decision-report snapshots are implemented; user acceptance remains pending.
- SDSS-018: real dashboard metrics, derived project statuses, status filters and workflow/report navigation are implemented. Global secondary supplier/evaluation/report/settings lists remain disabled; user acceptance of dashboard and filtering is pending.
- SDSS-017: full AHP/AI journeys, broader accessibility/mobile review and recovery/deployment verification remain incomplete.
- Login, roles, operational safeguards and real purchasing authorization are outside current demonstration readiness. APIs must stay local.

Do not mark the whole project or SDSS-017 Done based on the manual journey alone. Update Trello only against each ticket's actual acceptance criteria.


## AI implementation verification - 2026-11-18

- Default backend run: 50 passed, seven opt-in cloud integration tests skipped.
- Browser page suite: 12 passed, including AI consent, service-error retry, preserved edits, exact-total gating, adjustment, explicit approval and reopening.
- Separate isolated Neon AI journey passed: generation leaves active weights alone; approvals capture original/applied weights and provenance; category changes invalidate AI context; stale concurrent responses do not overwrite drafts; cross-project access is rejected; historical reports remain unchanged.
- One valid live Cloudflare suggestion was generated with synthetic two-criterion context after handling structured provider response objects. This was a direct provider check, not a request using the user's project or suppliers.
- Migration 10 was applied. No real project weighting, evaluation matrix, ranking or purchasing decision was altered by verification.
- AI-assisted PDF layout was rendered and visually inspected. The report distinguishes original suggestions and approved weights and includes provider/model, priorities, explanations and review notes.
- The user subsequently verified AI generation, approval, decision version 3 and its downstream report. SDSS-017 and the whole project remain incomplete.


## Dashboard implementation verification - 2026-11-18

The read-only cloud projection identified the user project as Approved and counted three supplier entries. No saved project, weights, matrix or decision was modified. The isolated manual journey verified Draft -> Evaluated -> Approved -> Needs review; the decision journey verified Deferred. Default backend checks passed (53 passed, seven opt-in integration skips). Browser checks cover totals, count-card filters, category search, empty results, six-row pagination, workflow navigation, and unavailable-state retry. User acceptance remains pending; do not mark the full release complete.


## Evidence upload verification - 2026-11-18

Default backend checks: 56 passed, eight opt-in cloud skips. Browser suite: 15 passed. Evidence checks cover supported formats, size/page limits, exact file hashes, retry identity, stale review versions, download/removal and preserved historical attachment metadata. The isolated cloud journey checks retained downloads after archival and supplier deletion, review invalidation and storage quotas. The user completed upload, reopened the saved supplier review, downloaded and opened the text file, recalculated the evaluation, confirmed decision version 4, and verified attachment metadata in both the saved web report and page 3 of its downloaded PDF (screenshots 752–759). Authenticated document access remains outside this demonstration.


## Dashboard user acceptance - 2026-11-18

Screenshot 760 showed one project, one approved decision, three supplier entries and zero projects needing review. The user confirmed Saved Report opened decision version 4 and Continue Workflow opened the approved decision. Screenshot 761 showed the Laptop search result with Approved status and three suppliers. The user then confirmed Approved / Needs review filtering and Clear filters restored the project. Dashboard and project-list navigation/search/filter acceptance is complete for this single-project demonstration; pagination remains covered by automated tests.

## Matrix review follow-up

Saving a supplier review changes the review revision included in matrix context. A context mismatch currently presents an empty matrix and requires explicit resubmission before recalculation, even when the project has no mandatory checks. Prior saved decisions remain intact. Automatically reusing old numbers is not implemented: changes to units, currency or selected criteria must not silently reinterpret old inputs. This usability limitation was observed during the evidence walkthrough. Explicit compatible-value recovery was subsequently implemented; see the verification below.


## Mandatory requirement user acceptance - 2026-11-18

The user created PRJ-000002, configured a mandatory document review and approved equal manual weights. All suppliers initially appeared Pending and the matrix was blocked. A and B were marked Passed; C was marked Failed and excluded from both matrix and rankings. A dominated all five criteria and scored 1, B scored 0. The initial report truthfully showed no attachments: notes had been saved without files. The user then uploaded requirement-linked documents for A and B, saved their reviews, recalculated and revised the decision. Screenshot 781 shows both saved evidence records; the user confirmed both in the downloaded PDF. Original laptop decision version 4 remains separate.


## Saved sensitivity implementation verification - 2026-11-18

Default backend suite: 57 passed, nine opt-in database skips. Three targeted browser checks passed: preview/retry/reset/stale baseline, named save with ambiguous-failure retry identity and reopening after refresh, and saved report/PDF handling. An isolated Neon journey applied migration 12 twice, compared stored results with server simulation, verified idempotency and changed-request conflict, project isolation, unchanged approved weights/rankings, decision snapshot capture, report stability after later saves, and rejection of saves against stale ranking inputs. PDF layout with saved scenario weights, changed winner, comparative ranks/scores and notes was rendered and visually checked. Migration 12 was applied to the configured database without editing demonstration records. User acceptance of named scenarios and report inclusion was subsequently completed; see the acceptance record below.


## Saved sensitivity user acceptance - 2026-11-18

The user ran the laptop price-priority scenario with weights 90/3/3/2/2. MAXI TECHNOLOGY moved from third to first (0.800663), THE POOLS INVESTMENT remained second (0.614756), and APPLE CAFE moved from first to third (0.199337). The named scenario survived refresh. The user created a new decision revision while retaining the approved AI weighting and APPLE CAFE selection. Screenshot 784 shows the saved scenario name, weights, comparative ranks/scores, actor/timestamp and notes in the report; the user confirmed the same content in the downloaded PDF. This verifies one saved scenario and its report snapshot, not universal ranking stability.


## Maximum price user acceptance - 2026-11-18

The user enabled 110000 RUB as a mandatory maximum on PRJ-000002, reapproved equal weights and reviewed supplier documents/prices. Screenshot 789 shows A eligible below the limit (100000), B excluded above it (120000) despite its document passing, and C eligible at the exact limit (110000). Screenshot 790 confirms only A/C in the matrix. After recalculation and a decision revision, screenshot 791 records the maximum and eligible supplier reviews; the user confirmed the PDF. The laptop project was not edited by this test.

## Matrix recovery implementation

Recover Previous Values is an explicit draft action. It filters to current eligible supplier IDs and matching currency/criterion meaning, and clears cells violating current bounds or reviewed prices. Recovery does not save, mark a matrix ready, calculate rankings or alter a decision. New matrix saves record input definitions; legacy recovery uses only an exact matching saved ranking snapshot. User acceptance remains pending.


Matrix recovery checks: 58 backend tests passed with nine opt-in skips; two targeted browser checks passed, including blank-to-recovered draft, new supplier blanks, disabled calculation, failed-save preservation and reopening after successful save. The isolated cloud matrix journey passed with explicit recovery, exact-version legacy snapshot fallback, blocked calculation before save, idempotent fresh save, and unchanged historical ranking content. Production build passed. Migration 13 only adds matrix input metadata; existing project inputs and decisions are preserved.


## Matrix recovery user acceptance - 2026-11-18

After a review-note edit on PRJ-000002, screenshot 793 offered ten compatible old cells. The user recovered the values, saved and recalculated, then confirmed Demo Supplier A as decision version 4 without a stale warning (screenshot 794). The user subsequently reported pushing the checkpoint and completing the Git status check.

## Smaller-screen implementation checks - 2026-11-18

Phone navigation now exposes both Dashboard and Purchasing Projects. Wide tables have named, focusable scroll regions instead of overflowing the whole page, including criteria, manual/AHP/AI weights, ranking comparisons and saved reports. Narrow forms, action groups, dialogs and pagination wrap; controls receive larger touch targets. Desktop sidebar remains available and scrollable.

Browser viewport checks at 375 and 768 pixels verify document width, Dashboard/project navigation, project entry, criteria configuration, manual/AHP/AI weighting, matrix entry and keyboard horizontal scrolling, review-dialog note entry/cancellation, and report layout. All 19 browser tests passed across the suite and targeted rerun; one project-reload test timed out in the parallel run and passed separately. Screenshots of phone matrix/report were visually inspected. Production build passed. These use mocked APIs in desktop Chrome viewport emulation, not physical-device Safari or a full accessibility audit. User acceptance and broader SDSS-017 recovery/end-to-end checks remain pending.


## Smaller-screen and outage user acceptance - 2026-11-18

Screenshots 800–801 show navigation, wrapped filters, table scrolling and vertically stacked form fields in a snapped narrow Chrome window. The user checked the form footer and cancelled without creating a project. The user reported pushing this checkpoint.

The user stopped the backend while keeping the frontend running. Screenshot 803 shows the unavailable state hiding totals and offering Try again, but the general fallback incorrectly asked the user to check entries. After restarting Uvicorn and retrying, screenshot 805 shows both projects restored as Approved, with zero Deferred / Needs review. The API helper now distinguishes transport failure, timeout, missing-detail server errors and unreadable success responses from validation errors. No saved records were changed by this outage test.


## Save-recovery user acceptance - 2026-11-18

PRJ-000003 (Save Recovery — Test) was created before the first backend shutdown. A later new-form failure preserved its visible values; the existing project was checked before retrying creation to avoid a duplicate. The user then edited the existing project's description with the backend stopped. Screenshot 810 shows the server-unavailable error and retained editing form. After restarting the backend, retrying Save Changes and refreshing, screenshot 812 retains Failed-save recovery check. The user explicitly confirmed the screenshot followed refresh. This verifies failed-update preservation, successful retry and persisted retrieval. The two approved projects remain separate.


## Complete regression checkpoint - 2026-11-18

With SDSS_RUN_DATABASE_TESTS=1, the entire backend suite passed: 67 tests, no skips, in 754.95 seconds. This includes nine opt-in cloud tests using temporary schemas, with cleanup in finally blocks. The suite covers migrations through version 13, project/supplier persistence and conflicts, manual/AHP/AI weighting, eligibility, evidence, matrix recovery, TOPSIS, sensitivity persistence, decisions and historical reports. AI-provider calls in the cloud suite use a deterministic synthetic stub; this is not a new live-provider verification. One Starlette/httpx deprecation warning remains in test infrastructure.

The complete browser suite passed 20 tests with two workers in 58.1 seconds, including smaller-screen layouts and backend-outage messages. Browser page API responses are mocked; cloud tests exercise actual FastAPI handlers via TestClient and isolated PostgreSQL storage. These complementary checks are not an uninterrupted browser-to-live-database automation. No approved demonstration project was edited by these automated tests.

See release-1-checklist.md for completed areas and remaining gaps. This checkpoint does not mark the entire project or SDSS-017 complete.


## Real browser-to-cloud journey - 2026-11-19

Added an explicitly opted-in runner with separate local ports 8001/5174 and a generated isolated PostgreSQL schema. No normal API test mode or production settings were added. The browser verifies its isolation identity and empty project list before writing; all application writes then use the real UI and real backend, without response interception or seeded project data.

The uninterrupted manual-weight journey passed in about 3.1 minutes: create/reopen project; add three suppliers; configure a document check and maximum price; approve equal weights; upload three synthetic files; verify below/above/exact-limit eligibility; exclude the overpriced supplier; save matrix and calculate ranking; save/reopen scenario; confirm human decision; download and compare actual evidence bytes; download PDF; refresh report; open the latest saved report from Dashboard. The runner extracted the actual PDF and checked decision, price rule, scenario and attachment text. All three PDF pages were rendered and visually inspected. No browser page errors were recorded.

Initial test assertions were corrected to await the saved-project route rather than a transient disabled form, and to identify the specific approval message rather than both status elements. A direct Node runner replaced npm-managed server teardown to give Windows test-service cleanup explicit ownership. One interrupted initial-run schema was removed by its exact identifier after verifying its services had stopped. Normal failed and successful runs exercised finally cleanup. Final verification found zero remaining browser-test schemas and no listeners on the two test ports. Existing demonstration projects and ordinary 8000/5173 configuration were not edited.

This completes an uninterrupted real-browser manual workflow check. Existing AHP/AI API journeys and user walkthroughs remain separate; they were not rerun as real-browser/cloud journeys here. Physical devices, additional browser engines, comprehensive accessibility and deployment recovery remain open; the whole project is not declared complete.


## AHP/AI browser extension and late-load fix - 2026-11-19

The test-only backend now substitutes Cloudflare settings/generation in its isolated process, identifies the model as synthetic-browser-fixture, and intentionally fails the first generation. It does not read private AI settings or contact the provider. Actual consent, strict parsing, persistence, human adjustment/approval and report projection remain on the real API path.

The first extended run passed manual and AHP journeys, then exposed a real AI UI race: an older initial GET response reset purchasing priorities after a provider failure. Development StrictMode can overlap initial effects; instant mocked reads had hidden this. AHP/AI page and history loads now use sequence guards and effect cleanup, so stale responses cannot apply or clear the current busy state. AI generation/save also invalidates older page loads. Two deterministic delayed-response browser checks pass, along with existing AHP/AI page tests (four targeted checks) and the production build.


The post-fix isolated run passed all three serial real-browser journeys in 6.4 minutes. Manual setup/decision version 1 passed; AHP version 2 passed with inconsistent-comparison rejection, 40/20/20/10/10 approval, matrix recovery, recalculation, refreshed approval and saved PDF; AI version 3 passed with consent gating, intentional provider failure/retry, retained priorities, unchanged active AHP weights during generation, 105% total blocking approval even when reviewed, human adjustment to 45/25/15/10/5, refreshed approval, matrix recovery, recalculation and report/PDF provenance. Actual downloaded PDFs were text-checked by the runner. Both new three-page PDFs were rendered and visually inspected.

The original manual and AHP report JSON remained identical after the later approvals. Dashboard opened the latest AI report. No browser page errors were recorded. The test backend recorded exactly two synthetic provider calls (failure then success), with no external provider use. Cleanup verification found zero remaining browser-test schemas and no listeners on the isolated test ports. Demonstration project records and private configuration were not changed.


## Additional user acceptance — 2026-11-19

The user confirmed keyboard navigation/focus, review-dialog focus containment and Escape, required-field validation, keyboard scrolling of tables, 200% zoom and Narrator labels. The user also confirmed opening the dashboard, saved report and PDF in Edge. These are user-reported acceptance checks, not a comprehensive accessibility audit or a full automated second-engine workflow. Physical mobile-device verification remains outstanding.


Login verification completed on 2026-11-19: 69 backend checks passed, plus the refreshed two-test real-auth check after password-attempt hardening; 26 browser page checks passed, and the additional account-screen check passed. The three signed-in manual/AHP/AI workflows passed in the extended run. Its final account test exposed an exact-label mismatch on the new role selector; explicit accessible labels fixed it. A focused rerun then passed manual setup and the real account/Approver journey (two tests, 6.8 minutes), including account creation, forced password changes, server-side denials, read-only matrix controls, Approver attribution, PDF export and unchanged earlier report JSON. Actual downloaded PDFs passed text checks. This is combined verification evidence, not a claim that one uninterrupted four-test run passed after the fix.

Migration 14 preserves existing data and historical Demo User labels. Before/after fingerprints matched for all 15 existing procurement tables; three saved projects remained and no real account was created. First Administrator setup remains a private user action after restarting the old port-8000 backend. Temporary runner services/schema were removed. The two exact schemas left by earlier interrupted test processes were identified by their synthetic contents and removed separately. Page and live trace outputs now use separate folders. Production build passed; user-reported keyboard, Narrator, zoom and Edge acceptance are recorded above. Comprehensive security/accessibility and deployment verification remain separate release work.


## User login acceptance — 2026-11-19

The user reported completing private first-Administrator setup, creating Officer/Approver accounts and their required password changes. Screenshot 815 shows the Officer viewing historical decision version 4, with the Approver/Administrator requirement and no revision button. Screenshot 816 shows the Approver with the revision button; the existing version and Demo User attribution are unchanged. Screenshot 817 shows the Approver's saved matrix with the read-only message. The user also confirmed read-only eligibility review, returning to the Administrator account and completing the account-disable flow. No password was requested in chat. These user checks supplement the isolated automated role tests; no new purchasing decision was requested during acceptance.

The subsequent page-loading investigation and measurements are recorded in page-loading-performance.md.
