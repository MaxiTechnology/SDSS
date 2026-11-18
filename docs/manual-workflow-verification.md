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

Saving a supplier review changes the review revision included in matrix context. A context mismatch currently presents an empty matrix and requires explicit resubmission before recalculation, even when the project has no mandatory checks. Prior saved decisions remain intact. Automatically reusing old numbers is not implemented: changes to units, currency or selected criteria must not silently reinterpret old inputs. This usability limitation was observed during the evidence walkthrough and remains a follow-up.


## Mandatory requirement user acceptance - 2026-11-18

The user created PRJ-000002, configured a mandatory document review and approved equal manual weights. All suppliers initially appeared Pending and the matrix was blocked. A and B were marked Passed; C was marked Failed and excluded from both matrix and rankings. A dominated all five criteria and scored 1, B scored 0. The initial report truthfully showed no attachments: notes had been saved without files. The user then uploaded requirement-linked documents for A and B, saved their reviews, recalculated and revised the decision. Screenshot 781 shows both saved evidence records; the user confirmed both in the downloaded PDF. Original laptop decision version 4 remains separate.


## Saved sensitivity implementation verification - 2026-11-18

Default backend suite: 57 passed, nine opt-in database skips. Three targeted browser checks passed: preview/retry/reset/stale baseline, named save with ambiguous-failure retry identity and reopening after refresh, and saved report/PDF handling. An isolated Neon journey applied migration 12 twice, compared stored results with server simulation, verified idempotency and changed-request conflict, project isolation, unchanged approved weights/rankings, decision snapshot capture, report stability after later saves, and rejection of saves against stale ranking inputs. PDF layout with saved scenario weights, changed winner, comparative ranks/scores and notes was rendered and visually checked. Migration 12 was applied to the configured database without editing demonstration records. User acceptance of named scenarios and report inclusion was subsequently completed; see the acceptance record below.


## Saved sensitivity user acceptance - 2026-11-18

The user ran the laptop price-priority scenario with weights 90/3/3/2/2. MAXI TECHNOLOGY moved from third to first (0.800663), THE POOLS INVESTMENT remained second (0.614756), and APPLE CAFE moved from first to third (0.199337). The named scenario survived refresh. The user created a new decision revision while retaining the approved AI weighting and APPLE CAFE selection. Screenshot 784 shows the saved scenario name, weights, comparative ranks/scores, actor/timestamp and notes in the report; the user confirmed the same content in the downloaded PDF. This verifies one saved scenario and its report snapshot, not universal ranking stability.
