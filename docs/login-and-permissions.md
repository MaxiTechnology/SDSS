# First login version

All signed-in accounts share the existing procurement workspace. This version adds account permissions; it does not create separate organizations or project assignments.

| Action | Administrator | Procurement Officer | Approver |
| --- | --- | --- | --- |
| Read projects, inputs, rankings, evidence and saved reports | Yes | Yes | Yes |
| Prepare projects, suppliers, criteria, weights and eligibility | Yes | Yes | No |
| Upload/archive evidence; save matrix; calculate rankings/scenarios | Yes | Yes | No |
| Confirm, revise or defer the final purchasing decision | Yes | No | Yes |
| Create accounts, change roles/status, reset another account | Yes | No | No |
| Change own password and sign out | Yes | Yes | Yes |

Permissions are enforced in the API before project handlers run. Hiding or disabling controls is supplementary. Officers may approve evaluation weights; final purchasing approval belongs to Approvers and Administrators. An Administrator can perform both roles, so this is not an enforced two-person approval scheme.

## First administrator

1. Install the locked backend dependencies and apply database migrations using the normal setup procedure. Migration 14 is additive; it adds accounts, sessions, attempt limits and nullable identity references.
2. Open `Create administrator.cmd` in the repository folder. Enter a username, display name and a private password in the masked local window. Passwords must contain 15–128 characters; spaces and Unicode are supported. Usernames are case-insensitive, 3–80 ASCII characters: letters, numbers, dot, underscore, @, + and hyphen.
3. The tool only works while no accounts exist. There is no default password or public first-account registration endpoint. It uses the existing private local database connection.
4. Restart the backend, refresh SDSS, click Check Account Setup, and sign in.
5. Open User Accounts to create Officer and Approver accounts. Share their initial passwords privately. Each must choose a different password at first sign-in.

Keep the first administrator password in your password manager. This version has administrator-assisted resets for other accounts, but no email recovery or offline reset tool for an existing administrator. At least one active Administrator must remain. Role/name/status changes and password resets revoke that account's sessions; stale account edits are rejected. Accounts are disabled rather than deleted so recorded identity references remain valid.

## Session behavior

Passwords are salted Argon2id hashes (64 MiB, three passes, parallelism one). Passwords, password hashes and raw session tokens are not returned in account APIs. Raw session tokens exist only in HttpOnly, SameSite Strict cookies; the database retains SHA-256 token digests. Browser local/session storage is not used for authentication. Session and API responses use no-store.

Sessions expire after eight hours or 30 minutes without server activity. Sign-out revokes the session. Password changes revoke all sessions and issue a replacement for the current browser. At most ten active sessions per account are retained. Sign-in uses generic errors, dummy hash verification for unknown users, and database-backed five-minute limits: five failures per username, twenty per client IP. Current-password confirmation also blocks after five failures for five minutes. No passwords are included in validation errors.

Every authenticated write requires an exact allowed Origin and a session-derived CSRF header. Login also checks Origin. Configure comma-separated exact `SDSS_ALLOWED_ORIGINS` without paths. Defaults allow the local frontend/backend on ports 5173/8000 for localhost and 127.0.0.1. Non-local origins must use HTTPS, which enables Secure `__Host-` cookies. Proxy deployments must explicitly configure the externally visible origin and client-IP handling; do not expose the local development setup directly.

New reviews, evidence uploads, weight approvals, saved scenarios and decisions record signed-in identity. Final decisions preserve the account ID, display label and role at confirmation. Existing Demo User records and historical report snapshots remain unchanged; adding login does not retroactively authenticate them. This is a synthetic-data demonstration, not a tamper-proof audit system or purchase order.

## Verification approach

Legacy business tests use an explicit pytest-only dependency override with a named test Administrator. Authentication tests have no override. Cloud auth tests and the browser runner create disposable schemas with no fallback to public tables. The browser runner creates only a temporary administrator offline, then uses real login, required password changes and the application UI for account/workflow actions. No production bypass switch is added. AI responses remain a labeled synthetic fixture in those isolated journeys.

Reference design guidance: [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [Argon2 API](https://argon2-cffi.readthedocs.io/en/stable/api.html).

Remaining deployment work includes HTTPS hosting, operational backups/recovery, multi-factor authentication and broader security/accessibility review. Login verification alone does not complete the whole release.


Verification checkpoint, 2026-11-19: the complete backend suite passed 69 checks with all cloud integrations enabled. The updated real-auth tests also passed after adding current-password attempt limits and restricting HTTP origins to loopback names. All 26 page checks passed; the additional focused account-screen check passed account creation, same-ID retry after failure, role selection and password reset. The production build passed. The account role selectors now have explicit accessible labels. Signed-in AI PDF pages 1 and 3 were rendered and inspected; actor, evidence/reviewer attribution and the report notice are readable.

Migration 14 was applied to the existing demonstration database. Fingerprints of all 15 existing procurement tables matched before/after migration, ignoring only the new nullable attribution columns. All three saved projects remained and zero accounts were created there. At that checkpoint, the port-8000 backend needed a restart and private Administrator setup was pending. The user subsequently completed setup and role acceptance; see manual-workflow-verification.md.


The focused real-browser account journey passed after the role-selector label fix: account creation, mandatory password changes, blocked Officer/Approver requests, read-only review, attributed approval, downloaded PDF and preserved earlier report. The manual/AHP/AI journeys also passed. See manual-workflow-verification.md for the exact combined-run evidence and cleanup record.
