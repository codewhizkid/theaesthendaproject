# Signup and email confirmation

When confirmation is required, signup returns a user without a session. The form
stays in place and asks the user to check their email. Business setup opens only
after a session exists and Supabase verifies the same user.

The confirmation email uses Supabase's standard confirmation link and redirects
to `/auth/callback`. That route exchanges the PKCE code, writes session cookies,
and verifies the user before redirecting to `/business`. Missing, expired, or
invalid codes redirect to `/auth/confirmation-error`. Destinations are fixed;
caller-supplied redirect targets are not used.

In Supabase Authentication URL Configuration, allow the exact callback URL for
each application environment. For the current local server this is
`http://127.0.0.1:3101/auth/callback`. Add the production callback when its origin
is established. Do not disable email confirmation to work around redirects.
Open the confirmation link in the same browser used for signup, where the PKCE
verifier is stored. If the email is confirmed but the verifier is unavailable,
return to sign in with email and password.

Verification:

- Run `node --experimental-strip-types --test tests/auth-session.test.mjs`.
- Run `npx tsc --noEmit` and targeted ESLint checks.
- Check missing-code and provider-error callbacks redirect to the recovery page.
- With disposable test accounts, verify confirmation-required signup stays on
  the form, the latest email creates a session, and business setup opens.
- Check expired/reused links and confirmation in another browser recover through
  sign-in, and confirmation-disabled signup verifies its immediate session.

Live email delivery and successful test-account confirmation have not been
verified by the automated checks. No live account or database records were
created during this implementation.
