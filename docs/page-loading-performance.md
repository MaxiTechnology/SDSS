# Page-loading investigation — 2026-11-19

Localhost was not the main measured delay. Three local API health requests took 100, 19 and 22 ms. Three database-backed account/session checks on the running backend took 1294, 1317 and 1452 ms. Opening a fresh cloud database connection took 1001, 959 and 958 ms, before a roughly 200 ms query and its commit. Every protected request opens one connection to validate its session and another in most project handlers.

## Change

The FastAPI lifespan now opens a psycopg_pool 3.3.3 connection pool and closes it on shutdown. Each process maintains two ready connections, grows to at most six, bounds its waiting queue to 24 requests, and times out checkout after eight seconds. Excess idle connections can shrink after 60 seconds; connections have a 30-minute maximum lifetime. Unavailable storage still uses the existing private 503 response. Normal database warnings remain enabled.

The existing database.connect() connection interface is retained, including wrappers used by isolated integration tests. A small connection subclass returns a lease in finally after the normal commit/rollback behavior; the default Psycopg connection context alone deliberately does not release pooled connections. Failed transactions roll back. Closed transports are discarded, checkout checks connection health, and reset runs RESET ALL in autocommit mode before another lease can use the connection. This prevents session settings such as an isolated test schema's search_path leaking into the next request. Prepared statements are disabled on these pooled connections to avoid session-state assumptions. Standalone migration/setup scripts still use fresh connections unless a pool is explicitly opened.

Session, active-account, role, expiry and CSRF checks still run for every request. No server-side authenticated response or authorization cache is used. The later navigation improvement retains only the last displayed list in the current signed-in App while a fresh read is pending; see below. Changing the private database configuration requires restarting the API to rebuild its pool.

Reference: [Psycopg connection-pool API](https://www.psycopg.org/psycopg3/docs/api/pool.html).

## Measurements

A temporary server on port 8002 used the updated application against the same database, without signing in or writing any procurement/account data. Six account/session checks took 1545, 419, 410, 422, 405 and 407 ms. The warm median was 410 ms versus the original 1317 ms median, approximately 69% lower for this request. The initial cold request still pays connection setup; this is not a claim that every page is 69% faster. Query count and cloud network latency still affect individual pages.

A connection-only probe reused two connection objects for six transactions: 1420 ms cold, then 416, 402, 404, 399 and 410 ms. The temporary server shut down normally; the user's port-8000 server was not interrupted and needs a restart to load this change.

## Verification

The default backend suite passed 59 checks, skipping eleven opt-in cloud cases. Real authentication tests passed with pooling explicitly enabled, including account changes/revocation, initial password changes, role denials, attribution and expiry. A new isolated cloud test passed connection reuse, search_path reset, rollback, closed-transport replacement, bounded checkout failure and shutdown. Its exhaustion check was corrected to acquire the held connection before shortening the timeout, so asynchronous reset time does not masquerade as a capacity failure.

The initial manual pool probe exposed that Psycopg's default connection context does not return a lease; the explicit context-exit implementation fixed it before workflow testing. Database warning and exception diagnostics remain enabled.

The two real-browser/cloud journeys passed with the pool lifecycle active: manual setup/evidence/eligibility/matrix/scenario/decision/PDF, followed by Officer/Approver account creation, password changes, blocked writes and attributed approval. Actual PDFs passed text verification and earlier report JSON stayed unchanged. This run took 3.7 minutes (manual 2.6, accounts 1.1), versus 6.8 minutes for the earlier same focused pair (manual 4.9, accounts 1.9). These are individual local runs, not a general latency guarantee. The test schema and services were removed.


## Dashboard and Purchasing Projects — second pass

Both screens use GET /api/projects. Its workflow projection previously executed nine application SQL commands sequentially (transaction isolation, projects, suppliers, reviews, criteria, weights, matrices, latest rankings and latest decisions). With reused connections, three projection reads took 2438 ms cold, then 1480 and 1316 ms.

The projection now uses one SELECT. Correlated JSON aggregates gather the related rows in one command; latest ranking/decision records include only fields needed to derive workflow status rather than their full saved snapshots. Project columns remain native PostgreSQL/Psycopg values, preserving Decimal budget precision. Row-level UUIDs and timestamps in JSON aggregates are restored before the existing derive/eligibility/matrix validation functions run. Supplier ordering, latest-run tie ordering, decision version precedence and activity sorting are retained. A single SELECT sees one consistent snapshot without the earlier separate isolation-setting command ([PostgreSQL snapshot behavior](https://www.postgresql.org/docs/current/transaction-iso.html)). No schema migration is needed.

The new projection measured 1566 ms cold, then 415 and 426 ms warm on the same three-project workspace. Every returned summary matched the earlier output exactly. These timings include connection checkout and commit, exclude authentication and frontend rendering, and are small local samples, not a page-speed guarantee.

Within one signed-in App, overlapping reads of the list share only the pending request, including development StrictMode's duplicate effect. Once that request completes, later navigation still fetches again. Switching between Dashboard and Purchasing Projects shows the last loaded list immediately with a Refreshing saved projects message while the new request is pending. An error hides the prior totals/list and offers retry; 401 handling still removes the signed-in App. A first load never substitutes invented zero totals. Nothing is stored in localStorage/sessionStorage or shared between signed-in App instances. Sequence guards prevent a late response from a previous route changing a newer form or its loading/error state.

Verification: the production build passed, all 29 page/browser checks passed, and the default backend suite passed 59 checks with twelve opt-in cloud cases skipped. The new isolated cloud projection test passed ten scenarios covering all seven workflow statuses, review timestamp matching, exact maximum-budget precision, superseded ranking runs and decision version precedence. It also asserts a single projection command for an empty workspace and the multi-project result. New delayed-response page checks passed pending-request coalescing, immediate known-data navigation, error hiding/retry and preservation of a newer unsaved form after a late old-page failure.

The real-browser/cloud manual and account-permission journeys also passed after these changes (two tests, 3.7 minutes). Dashboard totals and saved-report navigation worked through the real API, role denials remained enforced, the Approver's report/PDF was saved, and the earlier manual report stayed unchanged. The runner verified downloaded PDF text and removed its schema/services.


## Inside project pages — third pass

The parent App previously cleared project metadata and waited for a fresh project GET before mounting each nested page. Nested pages now receive their project ID directly from the route and mount independently. The initial metadata request runs alongside the page request; overlapping metadata reads share only their pending promise. Once metadata for that project is known, moving between its sub-pages reuses it for the reference/header. The base editable Project Details view still loads the server version (or joins its pending read) before editing. Route sequence guards and project-ID keys prevent another project's late response from replacing the current view. Child page data is fetched anew; no authorization, evaluation or saved-decision response cache is introduced.

Criteria, Manual Weighting, Eligibility, Matrix, Rankings, Decisions, AHP and AI GET handlers now request a single, scoped project snapshot from project_read.py. Fixed internal field definitions select only the related groups needed by each handler. The project ID remains a bound UUID parameter. Row-level UUID/timestamp types are restored using the same decoder as the list projection, while original snapshot JSON remains unchanged. Each of these eight GET handlers executed one SQL command in the read probe.

These GET reads no longer take a project write lock merely to read the page. One SELECT supplies a consistent snapshot for criteria, reviews, weights and currentness checks. This also lets Rankings and Decisions read in parallel rather than waiting on the same project lock. Mutating endpoints retain the existing project locks, context checks and optimistic revisions. The existing AI response builder is shared between its read path and write-response path; provider calls/consent logic are unchanged. Legacy matrix recovery still uses only an exact matching stored ranking basis, and historical rankings/decisions remain readable when current eligibility is invalid.

Warm matched handler measurements on project 2, with the pool already primed:

| Handler | Earlier implementation (ms) | Updated implementation (ms) |
| --- | ---: | ---: |
| Criteria | 822 | 442 |
| Manual weights | 998 | 414 |
| Eligibility | 1507 | 450 |
| Matrix | 1505 | 514 |
| Rankings | 1742 | 454 |
| Decisions | 1875 | 503 |
| AHP | 979 | 452 |
| AI weights | 1086 | 432 |

These direct handler measurements include checkout/commit but exclude authentication, browser rendering and the earlier metadata waterfall. The original committed implementation and updated handlers ran in the same probe process against the same saved data. All eight response bodies matched exactly. Sixteen additional response/error-state comparisons on the other approved project and the draft project also matched. No saved project was modified by these probes.

Validation: production build passed; all 71 backend checks passed with every cloud integration enabled; all 31 page/browser checks passed. New delayed-metadata tests prove the inner controls can load before metadata resolves, the pending metadata request is shared, the editable base form reloads, and another project's late response cannot replace the current page. All four real browser/cloud journeys passed in one 4.1-minute run: manual setup/evidence/eligibility/scenario/decision/PDF, AHP revision, synthetic-provider AI revision, and account roles/Approver approval. Actual downloaded PDFs passed text checks and earlier report JSON remained unchanged. Temporary test services and schemas were removed. Restart the backend to load these server changes.

## Workspace navigation follow-up

Suppliers, Criteria & Weighting, Evaluations, Reports and User Accounts now retain successful read results in memory inside the signed-in application. Returning to a page renders its known data while explicitly refreshing; a failed refresh hides those records. Menu pointer/focus starts the read early, and overlapping requests share one pending read. Every later visit still revalidates; no server authorization or session checks are cached. Account Edit controls wait for the fresh read.

Successful API mutations invalidate remembered reads and pending-read generations, so an old response cannot repopulate the store after a save. Signing out, expiry or leaving the signed-in application destroys the provider. No data is stored in local/session storage. This improves return-navigation display latency; first visits and fresh reads still depend on the API/database connection. No new cloud latency benchmark is claimed for this change.

Validation: all 40 browser page checks and the production build passed. Four targeted delayed-response checks cover return-navigation display, failed-refresh hiding, account-edit readiness, sign-out clearing, preloading/coalescing and invalidation after successful writes. This change is frontend-only and needs a browser refresh, with no backend restart or database migration.
