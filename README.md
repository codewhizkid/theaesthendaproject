# Aesthenda

Aesthenda is a salon scheduling application under active development. A reachable testing deployment is not a production-release certification.

## Start with the working application

The current hosted application source is on **[`aesthenda-render-preview`](https://github.com/codewhizkid/theaesthendaproject/tree/aesthenda-render-preview)**, inside `production-app/`.

- [Open the hosted preview](https://aesthenda-preview.onrender.com)
- [Owner sign-in](https://aesthenda-preview.onrender.com/auth/sign-in)
- [Salon dashboard](https://aesthenda-preview.onrender.com/dashboard)
- [Current project map](https://github.com/codewhizkid/theaesthendaproject/blob/aesthenda-render-preview/PROJECT%20MAP.md)

The preview has a separate access gate before normal account sign-in. Its credential belongs in Render’s protected environment settings. The website root is still a foundation landing page.

## Which branch should I use?

| Branch | Purpose |
| --- | --- |
| `aesthenda-render-preview` | Current working application; Render deploys this branch |
| `main` | Earlier repository baseline, governing instructions, prototype and product references; application code here is older |
| `codex/dashboard-visual-concept-01` | Preserved historical dashboard concept; its draft PR is superseded by the working preview |

`main` and the hosted-preview branch were created with separate Git histories. They have not been forcibly combined. Base new application work on `aesthenda-render-preview`; preserve the references and history on `main`.

## Where things belong

| Location | Contents |
| --- | --- |
| `production-app/` | Application source; use the hosted-preview branch for its current implementation |
| `prototype/` | Reference UI and workflow sandbox, preserved on this branch |
| `Every Day Reading Files/` | Product and design reference PDFs |
| `AESTHENDA_GLOBAL_AUTHORITY.md` | [Governing project instructions](AESTHENDA_GLOBAL_AUTHORITY.md) |
| `START HERE.md` | Historical status and reference-document map on this branch |

Editable specification sources also live in the local sibling `Aesthenda Documents` folder; that folder is not included in this repository.

## Code, hosting and records

GitHub stores application code and versioned database migrations. Render hosts the preview. Supabase provides PostgreSQL and account authentication. Business, client and appointment records belong in the database, not GitHub.

Install dependencies with `npm ci` inside the relevant application folder. Keep local `.env` files, passwords, private keys, dependency folders and generated build output out of Git. Retain migration history and useful reference documents.

## Organization review — November 23, 2026

The cleanup removes five unused starter SVGs and adds project guides to the hosted-preview branch. All 81 existing unit checks, ESLint and whitespace checks passed locally; a full isolated build was blocked by Google Fonts access. About 1 GB of generated local files was removed separately; those files were not stored on GitHub.

The historical dashboard branch is retained because it contains a unique commit and is still the branch of the existing local working checkout. It should not be deleted until that checkout’s uncommitted work is safely reconciled. No customer records, migrations or useful historical references were deleted.
