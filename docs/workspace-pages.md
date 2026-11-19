# Shared workspace pages

The main navigation now opens Suppliers, Criteria & Weighting, Evaluations and Reports alongside Dashboard, Purchasing Projects and Administrator User Accounts. All signed-in roles can read the shared procurement workspace. Only Administrators and Procurement Officers can prepare supplier entries or templates; final decision permissions remain unchanged.

## Suppliers

Search project supplier entries by name, location, description, project name or reference, and filter by project. Add an entry to a selected project or copy its descriptive fields to another project. Each copy gets its own identifier. Reviews, evidence, prices and matrix inputs are not copied. This is a directory of project entries, not a deduplicated vendor identity or full supplier CRM. Existing project controls still manage edits/removals and protect against stale writes.

## Criteria & Weighting

The project overview links to saved criteria and the active weighting method. Reusable templates capture a saved source configuration, optional currently approved weight values, mandatory checks and the maximum-price rule. Templates are currency-specific. Name and notes can be edited; archive/restore controls availability. To change the configuration itself, save a new template from a reviewed project.

Applying requires a freshly loaded preview and explicit confirmation. It replaces criteria and saves **unapproved manual draft weights**, even if the source used AHP or AI. Without captured weights, selected criteria start at zero. Review and approve the weights, review supplier eligibility again, save the matrix and recalculate before confirming another decision. Existing saved decisions and reports remain intact. Changing the source later does not change the template or its applications. No currency conversion is performed.

Creation checks source project/criteria/weight versions and current approval. Application checks target project/criteria/weight and template versions, locks affected records and commits criteria, weights and an application receipt together. Stable request identifiers make unchanged retries safe after an uncertain response; a conflicting reuse is rejected. A failed transaction rolls back every write. New migration 15 creates the template and application tables without changing procurement records.

## Evaluations

Search projects and filter by workflow status or presence of rankings. Each row shows readiness, latest calculation currentness and the highest-ranked supplier set, with links into the project workflow. Historical calculations may require recalculation. TOPSIS scores compare suppliers within one project's inputs and weights; they are not comparable across projects.

## Reports

Search saved decision versions by project/reference, supplier, confirmer or justification. Filter by project or decision type; uncheck “Latest saved version per project” to browse history. Open saved reports or download their PDFs. Latest saved means the highest stored version, not certification that current inputs remain unchanged. “Review Project” opens the current decision page.

## Checks and acceptance

Isolated database tests cover empty directories, supplier copies, evaluation currentness, template capture/version conflicts, archive/restore, currency mismatch, zero-weight drafts, safe retries, rollback after a partial-write failure, real account permissions and preserved historical reports. Browser page tests cover search/filters, PDF retry, template preview/confirmation, failed-save retry, read-only Approver controls and phone-width overflow. The real-browser journey exercises supplier copying and draft template application through the UI against isolated storage.

User acceptance of these four new pages is still pending. Deployment configuration, production security review, physical-device testing and the broader release checklist remain separate work.

Verification checkpoint: 72 backend checks passed with all database integrations enabled; 36 browser page checks and the production build passed. Migration 15 was applied locally with before/after fingerprints confirming all existing procurement records unchanged and three projects preserved. The real-browser rerun also includes a regression fix for late initial Matrix reads clearing newly entered values; an explicit delayed-response page test verifies preservation of those edits.

All five real-browser/cloud journeys passed: manual, AHP, AI with synthetic provider, account permissions/Approver confirmation, and the new workspace journey. The workspace journey copied two supplier entries without evidence, captured approved values, explicitly previewed/applied an unapproved manual draft, browsed evaluation readiness and report history, and downloaded/opened the saved Approver report. Earlier report JSON remained unchanged; downloaded PDF contents were verified. Temporary browser/workspace schemas were removed. Read-only checks of the normal workspace returned three projects, six supplier entries and nine saved report versions, with no templates created by these checks.
