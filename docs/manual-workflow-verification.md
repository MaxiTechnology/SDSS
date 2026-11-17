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
- SDSS-014: sensitivity trials are temporary; reports truthfully identify the absence of saved findings.
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
