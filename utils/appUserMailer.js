const nodemailer = require("nodemailer");
const { renderAppUserEmail } = require("./mailTemplates");
const { getPlatformSettings } = require("../services/platformSettingsService");

const FALLBACK_FROM_NAME = "Platform";

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
    console.warn(
      "Failed to load platform settings for SMTP from name:",
      error?.message || error
    );
  }

  return FALLBACK_FROM_NAME;
}

async function appUserFromAddress() {
  const configuredFrom = String(process.env.SMTP_FROM || "").trim();
  const email = configuredFrom.includes("@")
    ? configuredFrom.replace(/^.*<([^>]+)>.*$/, "$1").replace(/"/g, "").trim()
    : process.env.SMTP_USER;
  const fromName = await resolveFromName();
  if (!email) return process.env.SMTP_USER;
  return `"${fromName}" <${email}>`;
}

async function sendAppUserEmail({ to, lang = "en", type, name, actionUrl }) {
  const transporter = createTransporter();

  if (!transporter) {
    return {
      sent: false,
      reason: "smtp_not_configured",
    };
  }

  const rendered = await renderAppUserEmail({
    type,
    lang,
    name,
    actionUrl,
  });

  await transporter.sendMail({
    from: await appUserFromAddress(),
    sender: process.env.SMTP_USER,
    replyTo: process.env.SUPPORT_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  return {
    sent: true,
    subject: rendered.subject,
  };
}

module.exports = {
  sendAppUserEmail,
};
