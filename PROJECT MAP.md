# Aesthenda project map

Cleanup review: November 23, 2026. Applied to the local project with Roe’s approval. Cleanup merged into `aesthenda-render-preview` through PR #2. The deployment branch now includes the cleanup; database records and deployment configuration were not changed.

## Where things belong

| Location | Purpose |
| --- | --- |
| `production-app/` | Working application served by Render |
| `production-app/app/` | Pages and server actions |
| `production-app/components/` | Shared interface components |
| `production-app/lib/` | Business rules, database access and integrations |
| `production-app/supabase/migrations/` | Versioned database changes; retain the complete history |
| `production-app/scripts/` | Development, migration and verification tools |
| `production-app/tests/` | Automated checks, including database-specific suites |
| `production-app/docs/` | Implementation decisions and handoffs |
| `prototype/` (local checkout) | Historical design reference; not included in the hosted-preview branch |
| `Every Day Reading Files/` (local checkout) | Product reference documents; not included in the hosted-preview branch |

## Hosting and data

- GitHub repository: `codewhizkid/theaesthendaproject`.
- Hosted preview branch: `aesthenda-render-preview`.
- Render service: `aesthenda-preview`.
- Hosted preview: https://aesthenda-preview.onrender.com.
- Owner sign-in: `/auth/sign-in`; working salon dashboard: `/dashboard`.
- `/` is still a foundation landing page, not the salon dashboard.
- Local staging launcher pins Supabase project `srwjgtvmlrkdqtxetjuu` (`aesthenda-staging`). This review did not independently inspect Render's database connection secrets.
- Real account and appointment information belongs in the database, not GitHub.
- Keep passwords, `.env` files and private keys out of GitHub.

## Branch organization

`aesthenda-render-preview` is the current application branch used by Render. `main` retains the earlier baseline, governing instructions, prototype and reference documents; its README links to this current app. The two branches have separate Git histories and were not forcibly combined. The older dashboard draft PR #1 is closed; its branch is preserved because it contains unique history and remains the branch of the local checkout.

## Local and GitHub alignment

Before cleanup, every tracked file in the hosted-preview branch matched the corresponding local file during this review (remote commit `1e94c797e5e6261f1b83b0f838822ec801c09c62`).
The original local checkout is on `codex/dashboard-visual-concept-01` with substantial modified and untracked work. Do not reset, clean or switch that working checkout before preserving its current state. A branch label alone does not describe all files present locally.

## Cleanup scope

Five unreferenced default starter SVGs and the tracked temporary file `supabase/.temp/cli-latest` were removed. The existing ignore rules already exclude future tool cache files.

No identical nonempty files were found in the reviewed source copy. Both legacy `schema.sql` files are labeled references and differ; retain them until a separate historical schema review resolves their purpose. Keep the prototype, migration history, tests and product documents.

Generated `.next/` (about 609 MB) and `.next-staging/` (about 369 MB) were removed after checking for local listeners on ports 3190 and 3000. They must be rebuilt for local preview use. Both folders were removed with Roe’s approval (1,024,090,704 bytes of generated file content). Keep `node_modules/` (about 470 MB) for now because it is required for local development.

## Validation

The existing 81 unit checks passed in the isolated source copy. ESLint passed. The isolated full build was blocked by unavailable Google Fonts access; no successful full build is claimed. Database integration checks and live data changes are outside this cleanup.
