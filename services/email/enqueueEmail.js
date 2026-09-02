const { enqueueOutboxEvent } = require("../outboxService");
const { resolveEmailLang } = require("../../utils/resolveEmailLang");

async function enqueueEmail({
  template,
  to,
  lang,
  data,
  correlation = {},
  idempotencyKey = "",
  availableAt = new Date(),
}) {
  const normalizedTo = String(to || "").trim().toLowerCase();
  if (!normalizedTo || !normalizedTo.includes("@")) {
    return null;
  }

  return enqueueOutboxEvent({
    type: "email.send",
    restaurantId: correlation.restaurantId || null,
    orderId: correlation.orderId || null,
    payload: {
      template,
      lang: lang || "en",
      to: normalizedTo,
      data,
      correlation,
    },
    idempotencyKey: String(idempotencyKey || "").slice(0, 180),
    availableAt,
  });
}

async function enqueueAuthEmail({ template, to, lang, data, appUserId, idempotencyKey }) {
  return enqueueEmail({
    template,
    to,
    lang,
    data,
    correlation: { appUserId },
    idempotencyKey,
  });
}

module.exports = {
  enqueueEmail,
  enqueueAuthEmail,
  resolveEmailLang,
};
