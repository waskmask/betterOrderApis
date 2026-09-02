const { pickLang } = require("../services/email/emailTemplateRegistry");

function resolveEmailLang({
  explicit,
  appUser,
  order,
  req,
} = {}) {
  if (explicit) {
    return pickLang(explicit);
  }
  if (appUser?.preferredLanguage) {
    return pickLang(appUser.preferredLanguage);
  }
  if (order?.customer?.locale) {
    return pickLang(order.customer.locale);
  }
  if (req) {
    const header =
      req.body?.lang ||
      req.query?.lang ||
      req.headers?.["x-locale"] ||
      req.cookies?.locale;
    if (header) return pickLang(header);
    const accept = String(req.headers?.["accept-language"] || "").split(",")[0];
    if (accept) return pickLang(accept);
  }
  return "en";
}

module.exports = {
  resolveEmailLang,
};
