# The Aesthenda Project

## Where the project stands

**Private-page protection — October 7, 2026:** `/dashboard` and `/business` now require a Supabase-verified user in both middleware and page rendering. Signed-out requests, including nested paths, redirect to `/auth/sign-in` without rendering private content; redirects are not cached. Session refresh cookies are passed to both the downstream request and browser response. Sign-in and confirmation recovery remain public. Local HTTP integration checks, TypeScript, targeted lint, and session-gating tests passed. Authenticated access and expired-session refresh with test accounts remain unverified; this change does not establish database account isolation or atomic business setup.

**Signup handling — October 7, 2026:** signup without a session now stays on the sign-in form with email-confirmation instructions. Immediate sessions and confirmation callbacks must resolve to the same server-verified Supabase user before continuing to business setup. `/auth/callback` exchanges the PKCE code; invalid or missing codes lead to a recovery page. The session-gating tests, TypeScript, and targeted lint passed locally. Live confirmation-email delivery and a complete test-account signup remain unverified. Supabase's allowed redirect URLs must include the application's `/auth/callback` URL; PKCE confirmation links should be opened in the browser used for signup. Page protection, atomic business setup, and database isolation remain separate outstanding work.

**Repository organization — October 7, 2026:** this project now uses one Git repository at the Aesthenda folder root, targeting `codewhizkid/theaesthendaproject`. The nested `production-app/.git` metadata and both pre-consolidation histories were preserved in `../Aesthenda-git-backup-20261007/`. Production and prototype source, project instructions, and everyday reference PDFs are included; credentials, dependencies, and generated output are excluded. Editable sources in the sibling `Aesthenda Documents` folder remain outside this repository. This organization change does not establish application or deployment readiness.

**Partial update — October 7, 2026:** local production-app loading is restored for the homepage, dashboard, sign-in and business routes. Cloud-only dependencies/cache/source files and native watcher exhaustion were observed. Refreshed locked dependencies, preserved the old cache, requested Keep Downloaded, and saved a polling-based development launcher. Restart was ready in 241 ms; later checks returned HTTP 200 in 19–100 ms. Homepage rendering was verified in the browser. Fresh compilation, long-term cloud retention and authenticated workflows remain separate verification limits. See [local loading repair evidence](<../Aesthenda Documents/Revise and Revive Files/Project Records/LOCAL_LOADING_FIX_2026-10-07.md>). This supersedes the local loading blocker below for the checked routes; the October 6 summary has not been fully re-reviewed. Business setup and security are the next outstanding work.

**Last status review: October 6, 2026.** Scope: current local application/test source, operating authority, phase status and decision records, the October 5–6 production handoff, and this guide's local navigation. This refresh reconciles earlier October 6 observations from this conversation; it did not rerun builds, tests, or HTTP probes. PDF/Word exports, hosted systems, live database state, and deployment were not independently audited. See the [dated review evidence](<../Aesthenda Documents/Revise and Revive Files/Project Records/SCRIBE_STATUS_REVIEW_2026-10-06.md>).

**Current position:** Aesthenda has an implemented Prototype / Reference UI and an early Production Application foundation. Production sign-in and business setup have limited observed success; the dashboard is a static module shell. A dependency refresh restored fast startup and successful local responses in the recorded diagnostic, but later homepage/dashboard probes timed out while a server was listening. Reliable page loading remains unresolved. The safer business-setup design is agreed in the handoff, but implementation and verification are still outstanding. Production readiness is not established.

| Area | Current evidence and limits |
| --- | --- |
| Product direction | The [global authority](<AESTHENDA_GLOBAL_AUTHORITY.md>) requires production SaaS behavior. Approved scope and pending product decisions remain in force; this review grants no new approval. |
| Prototype / Reference UI | [Studio UI](<prototype/components/studio/studio-app.tsx>) contains calendar, appointment, client, service, and availability views. [Storage](<prototype/hooks/use-studio.ts>) uses localStorage and seeded data. [Booking preview](<prototype/components/studio/booking.tsx>) simulates verification and holds and sends no payment or message. These are prototype capabilities. |
| Production implementation | Next.js/Supabase sign-in/sign-up and a [business form](<production-app/components/business/business-form.tsx>) exist. The [dashboard](<production-app/app/dashboard/page.tsx>) renders module cards, not implemented production calendar/client/service workflows. The October 5 user-reported setup success is one observed flow, not an isolation or reliability test. |
| Verification and runtime | The [handoff](<../Aesthenda Documents/Revise and Revive Files/Project Records/PRODUCTION_APP_HANDOFF_2026-10-05.md>) records 9 prototype tests and a production build passing October 5. Its October 6 diagnostic records a lockfile dependency reinstall, 249 ms startup, and HTTP 200 for both routes after slow initial compilation. Later October 6 checks in this conversation timed out for `/` after 15 seconds and `/dashboard` after 10 seconds; port 3101 still had a listener. These observations are preserved together: startup improved, but consistent responses and the later timeout cause remain unverified. No test/build was rerun during this documentation refresh. |
| Business-setup contract | The October 6 handoff records Sup/Bopit agreement on a versioned server action, server-verified identity, and a private database transaction that creates business and professional together with rollback and safe retries. This is design agreement, not implementation or test evidence. The handoff reports private runtime connection provisioning still needed; no PostgreSQL driver is declared in the current app manifest. |
| Production gaps | The current business form still performs two separate browser-side inserts. It allows caller-selected business status and writes professional status `active`, differing from the recorded setup design and Phase 1 lifecycle baseline. Both SQL files remain, with RLS policies evident only for businesses/professionals in the Supabase copy; migration replay, forced RLS/privilege design, rollback, retries, and cross-account denial are unverified. Middleware refreshes sessions without an unauthenticated dashboard redirect. Deployment, recovery, integrations, and operational verification remain incomplete or unverified. |
| Pending product decisions | Roe still needs to resolve owner-to-business cardinality, repeat setup with a new request key, and professional full-name requirement/source. [Phase 1](<../Aesthenda Documents/Revise and Revive Files/Phase_01_Domain/AESTHENDA_CORE_Phase_1_Domain_Design_v2.2_FINALIZED_BASELINE.md>) already records lifecycle starts `trial` (Business Account) and `onboarding` (Professional); the earlier conversational suggestion to activate immediately was not approved and does not override that baseline. [Phase 7](<../Aesthenda Documents/Revise and Revive Files/Phase_07_UI/READ ME.md>) still records D01/D02 approved, D03/D04 partial, D05–D09 pending, and 16 assumptions awaiting approval. |
| Specification consolidation | [Phase 4](<../Aesthenda Documents/Revise and Revive Files/Phase_04_System_Architecture/READ ME.md>) and [Phase 6](<../Aesthenda Documents/Revise and Revive Files/Phase_06_API_Actions/READ ME.md>) still require full consolidation. Approved amendments and handoff remain controlling in the meantime. |

**Recommended next work (unassigned):** Devon/Jefe should reconcile the later local response timeouts with the earlier successful diagnostic and capture the actual wait/failure before choosing another runtime fix. Roe resolves the three remaining setup behaviors and product priorities. Under the recorded design, Devon owns the private runtime connection plan; Sup owns persistence/migrations/RLS; Bopit owns the canonical setup action; Skip wires the form after the contract is stable. QA verifies success, rollback, retry/concurrency, and two-account boundaries in a disposable/local environment; Secure reviews privileges and RLS. Preserve existing uncommitted work. These are ownership-based next steps, not a claim that agents are currently running or that live database changes, deployment, or launch are approved.

## How to use this guide

**Document locations updated October 5, 2026:** `Archive Files/` and `Revise and Revive Files/` now live in [Aesthenda Documents](<../Aesthenda Documents>) on the Desktop, beside this project. Both folders were moved intact; current navigation and agent paths were updated. Historical snapshots, manifests, and scripts retain their original paths as provenance. Application status and verification above are unchanged.

Read [AESTHENDA_GLOBAL_AUTHORITY.md](<AESTHENDA_GLOBAL_AUTHORITY.md>) first. It is the operating charter and defines the production mandate and completion gates. Read product references from **Every Day Reading Files**, revise editable phase sources through [Revise and Revive Files](<../Aesthenda Documents/Revise and Revive Files>), and use [Archive Files](<../Aesthenda Documents/Archive Files>) for history.

## Project mandate — production SaaS

Aesthenda is a production SaaS product intended for real paying customers and real business data.

| Layer | Purpose and completion standard |
| --- | --- |
| Prototype / Reference UI (`prototype/`) | Preserve the existing visual and workflow sandbox and approved interaction intent. Simulations and synthetic data may support explicitly prototype-only work and tests; they do not satisfy production requirements. |
| Production Application | Build secure, persistent, multi-user service behavior. Completion requires real persistence, authentication, account isolation, authoritative server-side business logic, production deployment, and real integrations within approved release scope, with verification evidence. |

All new implementation work targets production-grade behavior unless explicitly marked **prototype-only**. This does not change approved workflows, scheduling rules, product scope, pending decisions, or specialist ownership. Multi-user service operation does not expand v1 into team or multi-professional scheduling.

## Governing map

Follow the source-of-truth hierarchy in the global authority. Its production mandate supersedes older private-prototype and future-implementation framing in phase sources, PDF exports, and historical records. The DG-01–DG-03 amendments and approved phase decisions continue to govern product behavior. Existing implementation and archived files do not create new product policy.

The PDFs below remain product/design reading references, not an up-to-date operating charter or production-readiness evidence. Read them with the global authority and current editable amendments. Their recorded approvals and pending decisions are preserved; this governance update does not regenerate or reapprove those exports.

The statuses below describe specification and approval status, not implementation progress.

| Document | Everyday reading | Revision folder | Specification / approval status |
| --- | --- | --- | --- |
| Master Blueprint | [Read PDF](<Every Day Reading Files/00_Master_Blueprint_v2.2.pdf>) | [Sources](<../Aesthenda Documents/Revise and Revive Files/Governance>) | Product scope; global authority governs production mandate; DG-01–DG-03 control product amendments |
| Phase 1 — Domain | [Read PDF](<Every Day Reading Files/01_Domain_Design_v2.2.pdf>) | [Sources](<../Aesthenda Documents/Revise and Revive Files/Phase_01_Domain>) | Finalized baseline |
| Phase 2 — User Experience | [Read PDF](<Every Day Reading Files/02_User_Experience_v2.2.pdf>) | [Sources](<../Aesthenda Documents/Revise and Revive Files/Phase_02_UX>) | Finalized baseline |
| Phase 3 — Business Rules | [Read PDF](<Every Day Reading Files/03_Business_Rules_v2.2.pdf>) | [Sources](<../Aesthenda Documents/Revise and Revive Files/Phase_03_Business_Rules>) | Finalized baseline |
| Phase 4 — System Architecture | [Read PDF](<Every Day Reading Files/04_System_Architecture_v2.2_AMENDED.pdf>) | [Sources](<../Aesthenda Documents/Revise and Revive Files/Phase_04_System_Architecture>) | Approved in practice; full consolidation pending |
| Phase 5 — Database | [Read PDF](<Every Day Reading Files/05_Database_v2.2_AMENDED.pdf>) | [Sources](<../Aesthenda Documents/Revise and Revive Files/Phase_05_Database>) | Internally approved; scheduling amendment controls |
| Phase 6 — API and Actions | [Read PDF](<Every Day Reading Files/06_API_Actions_v2.2_AMENDED.pdf>) | [Sources](<../Aesthenda Documents/Revise and Revive Files/Phase_06_API_Actions>) | Decisions approved; full consolidation pending |
| Phase 7 — UI | [Read PDF](<Every Day Reading Files/07_UI_Blueprint_v2.2_REVIEW.pdf>) | [Sources](<../Aesthenda Documents/Revise and Revive Files/Phase_07_UI>) | Review package ready; D01/D02 approved; D03/D04 partial; D05–D09 pending; 16 assumptions await approval |

**Continue here:** Build the Production Application against approved behavior and the global authority completion gates; track missing infrastructure as production gaps. Continue Phase 7 UI review for unresolved product decisions. The September 13 package contains seven decision proposals and 16 labeled assumptions, with a decision overview on page 4 and the approval record on page 9. The nine-page replacement PDF is verified; no new decisions are approved. Also consolidate the Phase 4 and Phase 6 specifications from their approved decisions and amendments. Phases −1 and 0 are in the master; Phases 8–11 are planned master sections and Phase 12 is deferred.

**When revising:** edit the Markdown baseline, amendment or Word document in its phase folder. Keep base documents and supporting PDFs for regeneration. Replace the matching everyday reading PDF after regeneration and verification. A PDF cover does not grant approval.

**Reading order and dependencies:** global authority governs implementation and completion; governing product amendments control the preserved master; Phases 1–3 define the foundation; Phase 4 architecture supports Phase 5 database and Phase 6 actions; Phase 7 follows the approved actions and journeys. Later decisions have been reconciled back into Phases 1–3.

For Phases 4–6, the scheduling amendment controls conflicting review text. Phase 6 additionally uses the approved handoff. Both governing amendments and the decision register remain authoritative.

**Archive:** includes older editions, all duplicate copies, early plans, the intact pre-decision snapshot, and previous build/QA files. Historical indexes and scripts retain their original paths as provenance; use this guide for current navigation.

[Complete file map and original filenames](<../Aesthenda Documents/Revise and Revive Files/Project Records/FILE_MAP.json>)

## Keeping the status current

**Refresh on request:** ask “Use Scribe to update START HERE.” [Scribe's instructions](<.github/agents/scribe.agent.md>) define the evidence review and documentation-only scope; [the Codex agent definition](<.codex/agents/scribe.toml>) makes the role available to local clients that load project custom agents. If the client does not load custom agents, ask it to read Scribe's instructions and follow that workflow directly.

Jefe owns the technical status summary under the existing technical-lead role; Roe remains the authority for product approvals and priorities. Each contributor supplies the evidence for their work and updates the affected status at handoff.

1. Update this guide in the same change or handoff when implementation progress, verification results, approvals, blockers, deployment evidence, next steps, or document locations change. Routine changes that do not affect project status need no status rewrite.
2. Update the relevant source or decision record first, then summarize it here with a link. Keep approved requirements, implemented prototype behavior, implemented production behavior, and verified deployment separate. Never turn a proposal or passing prototype test into an approval or release claim.
3. For each changed status, record the date, evidence, verification scope/environment, remaining gap, and next action/owner. Link detailed handoff or verification records from [Project Records](<../Aesthenda Documents/Revise and Revive Files/Project Records>) rather than growing this guide into a task log. Mark missing evidence as **unverified** and unassigned work as **unassigned**.
4. Advance “Last status review” only after reviewing the whole summary against its sources. A partial update should carry its own date without implying everything was rechecked. Reconcile the summary before onboarding a new contributor or making a milestone/release claim; the date is not an automatic freshness guarantee.

This guide is maintained at handoff; it does not automatically detect changes. If work happened elsewhere or after the recorded review, reconcile that evidence before relying on the summary.

**Historical organization date: September 8, 2026 — not the status-review date.** The reorganization preserved original files, including duplicates, and shortened the eight everyday PDF filenames without changing their contents at that time. Later document revisions are recorded in their phase folders.
