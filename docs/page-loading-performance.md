# Page-loading investigation — 2026-11-19

Localhost was not the main measured delay. Three local API health requests took 100, 19 and 22 ms. Three database-backed account/session checks on the running backend took 1294, 1317 and 1452 ms. Opening a fresh cloud database connection took 1001, 959 and 958 ms, before a roughly 200 ms query and its commit. Every protected request opens one connection to validate its session and another in most project handlers.

## Change

The FastAPI lifespan now opens a psycopg_pool 3.3.3 connection pool and closes it on shutdown. Each process maintains two ready connections, grows to at most six, bounds its waiting queue to 24 requests, and times out checkout after eight seconds. Excess idle connections can shrink after 60 seconds; connections have a 30-minute maximum lifetime. Unavailable storage still uses the existing private 503 response. Normal database warnings remain enabled.

The existing database.connect() connection interface is retained, including wrappers used by isolated integration tests. A small connection subclass returns a lease in finally after the normal commit/rollback behavior; the default Psycopg connection context alone deliberately does not release pooled connections. Failed transactions roll back. Closed transports are discarded, checkout checks connection health, and reset runs RESET ALL in autocommit mode before another lease can use the connection. This prevents session settings such as an isolated test schema's search_path leaking into the next request. Prepared statements are disabled on these pooled connections to avoid session-state assumptions. Standalone migration/setup scripts still use fresh connections unless a pool is explicitly opened.

Session, active-account, role, expiry and CSRF checks still run for every request. No authenticated responses or authorization decisions are cached. Changing the private database configuration requires restarting the API to rebuild its pool.

Reference: [Psycopg connection-pool API](https://www.psycopg.org/psycopg3/docs/api/pool.html).

## Measurements

A temporary server on port 8002 used the updated application against the same database, without signing in or writing any procurement/account data. Six account/session checks took 1545, 419, 410, 422, 405 and 407 ms. The warm median was 410 ms versus the original 1317 ms median, approximately 69% lower for this request. The initial cold request still pays connection setup; this is not a claim that every page is 69% faster. Query count and cloud network latency still affect individual pages.

A connection-only probe reused two connection objects for six transactions: 1420 ms cold, then 416, 402, 404, 399 and 410 ms. The temporary server shut down normally; the user's port-8000 server was not interrupted and needs a restart to load this change.

## Verification

The default backend suite passed 59 checks, skipping eleven opt-in cloud cases. Real authentication tests passed with pooling explicitly enabled, including account changes/revocation, initial password changes, role denials, attribution and expiry. A new isolated cloud test passed connection reuse, search_path reset, rollback, closed-transport replacement, bounded checkout failure and shutdown. Its exhaustion check was corrected to acquire the held connection before shortening the timeout, so asynchronous reset time does not masquerade as a capacity failure.

The initial manual pool probe exposed that Psycopg's default connection context does not return a lease; the explicit context-exit implementation fixed it before workflow testing. Database warning and exception diagnostics remain enabled.

The two real-browser/cloud journeys passed with the pool lifecycle active: manual setup/evidence/eligibility/matrix/scenario/decision/PDF, followed by Officer/Approver account creation, password changes, blocked writes and attributed approval. Actual PDFs passed text verification and earlier report JSON stayed unchanged. This run took 3.7 minutes (manual 2.6, accounts 1.1), versus 6.8 minutes for the earlier same focused pair (manual 4.9, accounts 1.9). These are individual local runs, not a general latency guarantee. The test schema and services were removed.
