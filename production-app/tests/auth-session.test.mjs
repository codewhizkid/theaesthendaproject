import assert from "node:assert/strict";
import test from "node:test";
import { hasVerifiedSession } from "../lib/auth-session.ts";

test("signup without a session cannot proceed to business setup", async () => {
  const auth = { getUser: async () => { throw new Error("Must not verify without a session"); } };
  assert.equal(await hasVerifiedSession(auth, null), false);
});

test("a session must resolve to the same verified user", async () => {
  const session = { user: { id: "account-a" } };
  for (const [user, error, expected] of [
    [{ id: "account-a" }, null, true],
    [{ id: "account-b" }, null, false],
    [null, null, false],
    [{ id: "account-a" }, { message: "Expired token" }, false],
  ]) {
    const auth = { getUser: async () => ({ data: { user }, error }) };
    assert.equal(await hasVerifiedSession(auth, session), expected);
  }
});
