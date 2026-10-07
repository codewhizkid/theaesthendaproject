import assert from "node:assert/strict";
import test from "node:test";

const origin = process.env.TEST_APP_URL ?? "http://127.0.0.1:3101";

for (const path of ["/dashboard", "/business", "/dashboard/settings", "/business/settings"]) {
  test(`${path} redirects signed-out requests before rendering`, async () => {
    const response = await fetch(new URL(path, origin), { redirect: "manual" });
    assert.equal(response.status, 307);
    assert.equal(new URL(response.headers.get("location"), origin).pathname, "/auth/sign-in");
    assert.match(response.headers.get("cache-control"), /no-store/);
    const body = await response.text();
    assert.doesNotMatch(body, /Aesthenda operating shell|Create your production business/);
  });
}

test("sign-in and confirmation recovery remain public", async () => {
  for (const path of ["/auth/sign-in", "/auth/confirmation-error"]) {
    const response = await fetch(new URL(path, origin), { redirect: "manual" });
    assert.equal(response.status, 200);
    await response.arrayBuffer();
  }
});
