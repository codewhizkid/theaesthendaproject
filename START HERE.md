# Aesthenda hosted preview

See [PROJECT MAP](PROJECT%20MAP.md) for the application layout, hosting details and November 23 cleanup review.

- Application source: [production-app](production-app/).
- Owner sign-in: https://aesthenda-preview.onrender.com/auth/sign-in.
- Salon dashboard: https://aesthenda-preview.onrender.com/dashboard.
- The root website page is a foundation landing page.

This cleanup branch removes five unused starter images and adds project navigation. It does not change authentication, business rules, database records or deployment settings. Local generated build folders and the local temporary tool file were also removed; neither was tracked on the hosted-preview branch.

Validation: all 81 existing unit checks, ESLint and whitespace checks passed locally. A full isolated build could not complete because Google Fonts access was unavailable.

The older local checkout contains a longer historical START HERE and reference/prototype files. Those are preserved locally and are not replaced by this short guide for the hosted-preview branch.
