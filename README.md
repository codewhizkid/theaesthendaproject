# Aesthenda working preview

This branch, `aesthenda-render-preview`, contains the current application deployed by Render.

- [Project map and branch roles](PROJECT%20MAP.md)
- [Sign in to the preview](https://aesthenda-preview.onrender.com/auth/sign-in)
- [Salon dashboard](https://aesthenda-preview.onrender.com/dashboard)
- [Application source](production-app/)
- [Governing instructions, prototype and references on main](https://github.com/codewhizkid/theaesthendaproject/tree/main)

The root website page is still a foundation landing page. The testing access gate is separate from normal account sign-in. Keep all credentials in protected environment settings.

The November 23 organization pass merged cleanup PR #2, removed five unused starter images, and closed the historical dashboard draft PR #1 while preserving its branch and unique history. The cleanup does not alter database records or application behavior.

For local development, run `npm ci` inside `production-app/`. Existing checks are `npm run test:unit` and `npm run lint`. Generated build folders are rebuildable and are not stored in GitHub. All 81 unit checks and ESLint passed during cleanup; the full isolated build was blocked by Google Fonts access. Hosted testing is not certification of production-release readiness.
