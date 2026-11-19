# SDSS demonstration verification checkpoint

Date: 2026-11-19. Scope: local Windows demonstration using synthetic data.

Complete regression (2026-11-18): 67 backend tests passed (all nine cloud tests enabled, no skips); 20 browser tests passed. Browser APIs are mocked; cloud integration tests run real handlers against isolated schemas.

| Area | Evidence available |
| --- | --- |
| Projects and suppliers | Cloud persistence tests; user creation, editing and reopening |
| Criteria and manual weights | API/browser checks; user equal-weight and laptop examples |
| AHP weights | Consistency/approval tests; user comparison example and versioned PDF |
| AI-assisted weights | Synthetic provider check, isolated approval/provenance tests; user approved weights and report |
| Mandatory documents | User Pending/Passed/Failed journey; excluded supplier absent from matrix/ranking |
| Maximum price | User below/above/exact-limit checks; saved report/PDF |
| Evidence files | Cloud storage/history tests; user upload/download and report/PDF capture |
| Matrix recovery | Compatible-value filtering tests; user recovered ten cells and confirmed a revised decision |
| TOPSIS | Mathematical validation, cloud calculations and user ranking examples |
| Sensitivity | Preview/reversal tests; user saved a 90% price scenario, reopened it, included it in web/PDF report |
| Human decisions | Approval/alternative/deferral/revision API tests; user approved and revised decisions |
| Dashboard and lists | Search/filter/navigation tests and user walkthrough |
| Smaller screens | Chrome 375/768 viewport checks; user snapped-window navigation/form checks |
| Outage and save recovery | User backend stop/restart, dashboard retry, retained failed edit and post-refresh persistence |

The acceptance record is in manual-workflow-verification.md. Historical test totals there reflect the versions checked at that time.

Three serial real-browser/cloud journeys passed on 2026-11-19: manual setup through evidence/eligibility/scenario/decision/PDF, AHP consistency through revised decision/PDF, and AI consent/retry/adjustment/approval through revised decision/PDF. Only the AI provider boundary uses a deterministic synthetic fixture; application requests and persistence are real. Earlier reports stayed unchanged and cleanup was verified. A late-response UI bug found by these checks was fixed, with four targeted browser checks and a successful build.

Remaining release verification:

- Live-provider availability/model behavior is separate from the synthetic AI workflow test; the earlier live synthetic suggestion check remains the provider evidence.
- Physical mobile devices / additional browser engines and comprehensive accessibility review.
- Deployment and operational recovery outside the local Windows development setup.
- Deployment security review remains. First-account and role acceptance were completed by the user; legacy Demo User records retain their historical attribution.
- Global supplier/evaluation/report pages and other settings remain disabled; project-scoped workflows and Administrator User Accounts are implemented.

These gaps mean the whole project and SDSS-017 should not be marked complete solely from passing existing checks.


Login checkpoint (2026-11-19): Administrator, Procurement Officer and Approver permissions are implemented. Backend: 69 checks passed, with the refreshed real-auth checks passing after password-attempt hardening. Browser pages: 26 checks plus the new account-screen check passed. Signed-in manual/AHP/AI journeys passed; a focused manual/account rerun passed after an accessible-label correction. Reports retained their earlier versions and the Approver identity appeared in the exported PDF. The production build passed. See manual-workflow-verification.md for combined-run scope.

Migration 14 was applied with unchanged fingerprints for all 15 existing procurement tables, preserving three projects. No real account was created. User setup and the login backend restart were subsequently completed; see the acceptance record. Temporary schemas and test services were cleaned up.
