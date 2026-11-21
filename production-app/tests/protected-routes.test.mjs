import assert from "node:assert/strict";
import test from "node:test";

const origin = process.env.TEST_APP_URL ?? "http://127.0.0.1:3101";

for (const path of ["/booking-preview", "/booking-preview/nested", "/services", "/services?new=1", "/clients?new=1", "/availability", "/availability?edit=weekly", "/availability?section=dates", "/settings", "/calendar?panel=client&id=00000000-0000-4000-8000-000000000001", "/calendar?panel=book&date=2031-01-06", "/calendar?panel=appointment&id=00000000-0000-4000-8000-000000000001", "/calendar?panel=reschedule&id=00000000-0000-4000-8000-000000000001", "/calendar", "/calendar/nested", "/dashboard", "/business", "/appointments/00000000-0000-4000-8000-000000000001/reschedule", "/appointments", "/appointments/00000000-0000-4000-8000-000000000001", "/clients", "/clients/00000000-0000-4000-8000-000000000001", "/dashboard/settings", "/business/settings"]) {
  test(`${path} redirects signed-out requests before rendering`, async () => {
    const response = await fetch(new URL(path, origin), { redirect: "manual" });
    assert.equal(response.status, 307);
    assert.equal(new URL(response.headers.get("location"), origin).pathname, "/auth/sign-in");
    assert.match(response.headers.get("cache-control"), /no-store/);
    const body = await response.text();
    assert.doesNotMatch(body, /Aesthenda operating shell|Create your production business|YOUR DAILY OVERVIEW|Today’s appointments/);
  });
}

test("sign-in and confirmation recovery remain public", async () => {
  for (const path of ["/auth/sign-in", "/auth/confirmation-error"]) {
    const response = await fetch(new URL(path, origin), { redirect: "manual" });
    assert.equal(response.status, 200);
    await response.arrayBuffer();
  }
});
