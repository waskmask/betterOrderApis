const test = require("node:test");
const assert = require("node:assert/strict");
const { escapeHtml } = require("../services/email/escapeHtml");
const { validateTemplateData, pickLang, interpolate } = require("../services/email/emailTemplateRegistry");
const { renderEmail } = require("../services/email/renderEmail");

test("escapeHtml escapes user content", () => {
  assert.equal(escapeHtml("<script>"), "&lt;script&gt;");
  assert.equal(escapeHtml("Tom & Jerry"), "Tom &amp; Jerry");
});

test("pickLang resolves de variants", () => {
  assert.equal(pickLang("de"), "de");
  assert.equal(pickLang("de-DE"), "de");
  assert.equal(pickLang("en"), "en");
  assert.equal(pickLang(""), "en");
});

test("interpolate replaces subject placeholders", () => {
  const subject = interpolate("Order {{orderNumber}} — {{restaurantName}}", {
    orderNumber: "BO123",
    restaurantName: "Pizza Place",
  });
  assert.equal(subject, "Order BO123 — Pizza Place");
});

test("validateTemplateData requires keys", () => {
  assert.throws(() => validateTemplateData("auth.verifyEmail", { name: "Test" }));
  assert.equal(
    validateTemplateData("auth.verifyEmail", {
      name: "Test",
      actionUrl: "https://example.com",
    }),
    true
  );
});

test("renderEmail loads auth welcome template", async () => {
  const rendered = await renderEmail({
    template: "auth.welcome",
    lang: "en",
    data: { name: "Alice" },
  });
  assert.ok(rendered.subject.includes("Welcome") || rendered.subject.length > 0);
  assert.ok(rendered.html.includes("Alice"));
  assert.ok(rendered.text.length > 0);
});

test("renderEmail loads German auth template", async () => {
  const rendered = await renderEmail({
    template: "auth.forgotPassword",
    lang: "de",
    data: { name: "Max", actionUrl: "https://example.com/reset" },
  });
  assert.ok(rendered.html.includes("Max"));
  assert.ok(rendered.html.includes("https://example.com/reset"));
});
