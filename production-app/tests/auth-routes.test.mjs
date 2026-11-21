import assert from "node:assert/strict";
import test from "node:test";

// Run against an explicitly started application; these tests send no email.
const origin = process.env.AUTH_TEST_ORIGIN ?? "http://127.0.0.1:3190";

test("bad confirmation links fail closed and ignore caller redirect targets", async () => {
  for (const query of ["", "?error=access_denied", "?next=https://example.com", "?code=invalid-test-code&next=https://example.com"]) {
    const response = await fetch(`${origin}/auth/callback${query}`, { redirect: "manual" });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/auth/confirmation-error");
    assert.match(response.headers.get("cache-control"), /no-store/);
  }
});

test("a signed-out visitor cannot reach the password update form", async () => {
  const response = await fetch(`${origin}/auth/update-password`, { redirect: "manual" });
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "/auth/recover");
});

test("recovery and confirmation resend are reachable from sign-in and failure screens", async () => {
  for (const path of ["/auth/sign-in", "/auth/confirmation-error"]) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /href="\/auth\/recover"/);
    assert.match(html, /href="\/auth\/resend-confirmation"/);
  }
  for (const path of ["/auth/recover", "/auth/resend-confirmation"]) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /type="email"/);
  }
});
