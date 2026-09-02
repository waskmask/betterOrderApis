const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const {
  hashToken,
  timingSafeEqualToken,
  createVerificationToken,
} = require("../services/auth/authTokenService");

test("auth tokens are single-use shape", () => {
  const token = createVerificationToken();
  assert.equal(token.raw.length, 64);
  assert.equal(token.hash.length, 64);
  assert.ok(token.expiresAt > new Date());
});

test("timingSafeEqualToken validates matching tokens", () => {
  const raw = crypto.randomBytes(16).toString("hex");
  const hash = hashToken(raw);
  assert.equal(timingSafeEqualToken(hash, raw), true);
  assert.equal(timingSafeEqualToken(hash, "wrong"), false);
});
