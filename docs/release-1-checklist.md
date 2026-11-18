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

A separate uninterrupted real-browser/cloud manual-weight journey passed on 2026-11-19, including evidence upload/download, price exclusion, scenario persistence, decision/PDF and Dashboard report navigation. Temporary schema and test-service cleanup were verified.

Remaining release verification:

- Extend uninterrupted browser/cloud automation to AHP and AI paths; the manual-weight path is now covered.
- Physical mobile devices / additional browser engines and comprehensive accessibility review.
- Deployment and operational recovery outside the local Windows development setup.
- Login, reviewer identity and authorization; the current application records an unauthenticated Demo User.
- Global supplier/evaluation/report/settings pages remain disabled; project-scoped workflows are implemented.

These gaps mean the whole project and SDSS-017 should not be marked complete solely from passing existing checks.
