const nodemailer = require("nodemailer");
const EmailDeliveryLog = require("../../modals/EmailDeliveryLog");
const { getPlatformSettings } = require("../platformSettingsService");
const { renderEmail } = require("./renderEmail");
const { resolveTemplateKey } = require("./emailTemplateRegistry");

const FALLBACK_FROM_NAME = "Platform";

function isEmailEnabled() {
  const raw = String(process.env.EMAIL_ENABLED ?? "true").trim().toLowerCase();
  return !["false", "0", "no", "off"].includes(raw);
}

function isPreviewMode() {
  const raw = String(process.env.EMAIL_PREVIEW_MODE ?? "false").trim().toLowerCase();
  return ["true", "1", "yes", "on"].includes(raw);
}

function createTransporter() {
  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_PORT ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASS
  ) {
    return null;
  }

  const port = Number(process.env.SMTP_PORT);
  const secureFromEnv = String(process.env.SMTP_SECURE || "").trim().toLowerCase();
  const explicitSecure =
    secureFromEnv === "true" ? true : secureFromEnv === "false" ? false : null;
  const secure = explicitSecure === true ? port === 465 : port === 465;
  const requireTLS = explicitSecure === true || port === 587;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    requireTLS,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function resolveFromName() {
  const envName = String(process.env.SMTP_FROM_NAME || "").trim();
  if (envName) return envName;
  try {
    const settings = await getPlatformSettings();
    const platformName = String(settings?.platformName || "").trim();
    if (platformName) return platformName;
  } catch (error) {
    console.warn("Failed to load platform settings for SMTP from name:", error?.message || error);
  }
  return FALLBACK_FROM_NAME;
}

async function fromAddress() {
  const configuredFrom = String(process.env.SMTP_FROM || "").trim();
  const email = configuredFrom.includes("@")
    ? configuredFrom.replace(/^.*<([^>]+)>.*$/, "$1").replace(/"/g, "").trim()
    : process.env.SMTP_USER;
  const fromName = await resolveFromName();
  if (!email) return process.env.SMTP_USER;
  return `"${fromName}" <${email}>`;
}

async function writeDeliveryLog({
  to,
  template,
  lang,
  status,
  correlation = {},
  outboxEventId = null,
  providerMessageId = "",
  error = "",
}) {
  try {
    return await EmailDeliveryLog.create({
      to: String(to || "").trim().toLowerCase(),
      template: resolveTemplateKey(template),
      lang,
      orderId: correlation.orderId || null,
      appUserId: correlation.appUserId || null,
      restaurantId: correlation.restaurantId || null,
      status,
      providerMessageId: String(providerMessageId || "").slice(0, 200),
      error: String(error || "").slice(0, 500),
      outboxEventId,
      sentAt: status === "sent" ? new Date() : null,
    });
  } catch (logError) {
    console.warn("[email] delivery log failed:", logError.message);
    return null;
  }
}

async function sendTransactionalEmail({
  to,
  lang = "en",
  template,
  data = {},
  correlation = {},
  outboxEventId = null,
  skipLog = false,
}) {
  const normalizedTo = String(to || "").trim().toLowerCase();
  if (!normalizedTo || !normalizedTo.includes("@")) {
    return { sent: false, reason: "invalid_recipient" };
  }

  const templateKey = resolveTemplateKey(template);

  if (!isEmailEnabled()) {
    if (!skipLog) {
      await writeDeliveryLog({
        to: normalizedTo,
        template: templateKey,
        lang,
        status: "skipped",
        correlation,
        outboxEventId,
        error: "email_disabled",
      });
    }
    return { sent: false, reason: "email_disabled" };
  }

  let rendered;
  try {
    rendered = await renderEmail({ template: templateKey, lang, data });
  } catch (error) {
    if (!skipLog) {
      await writeDeliveryLog({
        to: normalizedTo,
        template: templateKey,
        lang,
        status: "failed",
        correlation,
        outboxEventId,
        error: error.message,
      });
    }
    throw error;
  }

  if (isPreviewMode()) {
    console.info(
      `[email-preview] to=${normalizedTo} template=${templateKey} lang=${rendered.lang} subject=${rendered.subject}`
    );
    if (!skipLog) {
      await writeDeliveryLog({
        to: normalizedTo,
        template: templateKey,
        lang: rendered.lang,
        status: "skipped",
        correlation,
        outboxEventId,
        error: "preview_mode",
      });
    }
    return { sent: false, reason: "preview_mode", subject: rendered.subject, preview: true };
  }

  const transporter = createTransporter();
  if (!transporter) {
    if (!skipLog) {
      await writeDeliveryLog({
        to: normalizedTo,
        template: templateKey,
        lang: rendered.lang,
        status: "failed",
        correlation,
        outboxEventId,
        error: "smtp_not_configured",
      });
    }
    return { sent: false, reason: "smtp_not_configured" };
  }

  try {
    const info = await transporter.sendMail({
      from: await fromAddress(),
      sender: process.env.SMTP_USER,
      replyTo:
        process.env.SUPPORT_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER,
      to: normalizedTo,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    if (!skipLog) {
      await writeDeliveryLog({
        to: normalizedTo,
        template: templateKey,
        lang: rendered.lang,
        status: "sent",
        correlation,
        outboxEventId,
        providerMessageId: info.messageId,
      });
    }

    console.info(
      `[email] sent template=${templateKey} lang=${rendered.lang} to=${normalizedTo} orderId=${correlation.orderId || "-"}`
    );

    return {
      sent: true,
      subject: rendered.subject,
      messageId: info.messageId,
    };
  } catch (error) {
    if (!skipLog) {
      await writeDeliveryLog({
        to: normalizedTo,
        template: templateKey,
        lang: rendered.lang,
        status: "failed",
        correlation,
        outboxEventId,
        error: error.message,
      });
    }
    throw error;
  }
}

/** Backward-compatible wrapper for auth emails */
async function sendAppUserEmail({ to, lang = "en", type, name, actionUrl }) {
  return sendTransactionalEmail({
    to,
    lang,
    template: type,
    data: { name, actionUrl },
  });
}

module.exports = {
  sendTransactionalEmail,
  sendAppUserEmail,
  isEmailEnabled,
  isPreviewMode,
  createTransporter,
  writeDeliveryLog,
};
