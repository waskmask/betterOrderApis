const { getPlatformSettings } = require("../services/platformSettingsService");

const FALLBACK_BRAND_NAME = "Platform";

const BRAND = {
  accent: "#465fff",
  accentSoft: "#eef2ff",
  ink: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
  surface: "#ffffff",
  page: "#f8fafc",
};

const copy = {
  en: {
    common: {
      preview: "Open this email in your browser",
      help: "Need help? Just reply to this email.",
      thanks: "Thanks for choosing {{brandName}}.",
      buttonFallback: "If the button does not work, use this link:",
      greeting: (name) => `Hi ${name || "there"},`,
    },
    welcome: {
      preheader: "Your {{brandName}} account is ready.",
      eyebrow: "Welcome",
      title: "Your account is ready",
      body:
        "Your {{brandName}} account has been verified successfully. You can now browse restaurants, save favorites, and place orders faster.",
      button: "Start ordering",
      closing: "We are excited to have you here.",
    },
    verifyEmail: {
      preheader: "Verify your {{brandName}} email address.",
      eyebrow: "Verify Email",
      title: "Confirm your email address",
      body:
        "Please verify your email so we can secure your account and finish setting up your {{brandName}} profile.",
      button: "Verify email",
      closing: "This verification link expires in 1 hour for your security.",
    },
    googleSignup: {
      preheader: "Your {{brandName}} Google signup is complete.",
      eyebrow: "Google Signup",
      title: "You are signed in with Google",
      body:
        "Your {{brandName}} account was created using Google. You can now discover restaurants, save addresses, and order with fewer steps.",
      button: "Explore restaurants",
      closing: "Your Google email is already verified.",
    },
    forgotPassword: {
      preheader: "Reset your {{brandName}} password.",
      eyebrow: "Password Reset",
      title: "Reset your password",
      body:
        "We received a request to reset your {{brandName}} password. If this was you, continue below. If not, you can safely ignore this email.",
      button: "Reset password",
      closing: "This reset link expires in 1 hour.",
    },
    resetSuccess: {
      preheader: "Your {{brandName}} password was changed.",
      eyebrow: "Password Updated",
      title: "Password changed successfully",
      body:
        "Your {{brandName}} password has been updated. If you did not make this change, contact support immediately.",
      button: "Go to login",
      closing: "For safety, any older sessions may require login again.",
    },
  },
  de: {
    common: {
      preview: "Diese E-Mail im Browser offnen",
      help: "Brauchst du Hilfe? Antworte einfach auf diese E-Mail.",
      thanks: "Danke, dass du {{brandName}} nutzt.",
      buttonFallback: "Falls der Button nicht funktioniert, nutze diesen Link:",
      greeting: (name) => `Hallo ${name || "du"},`,
    },
    welcome: {
      preheader: "Dein {{brandName}} Konto ist bereit.",
      eyebrow: "Willkommen",
      title: "Dein Konto ist bereit",
      body:
        "Dein {{brandName}} Konto wurde erfolgreich bestaetigt. Du kannst jetzt Restaurants entdecken, Favoriten speichern und schneller bestellen.",
      button: "Jetzt bestellen",
      closing: "Wir freuen uns, dass du dabei bist.",
    },
    verifyEmail: {
      preheader: "Bestaetige deine {{brandName}} E-Mail-Adresse.",
      eyebrow: "E-Mail bestaetigen",
      title: "Bestaetige deine E-Mail-Adresse",
      body:
        "Bitte bestaetige deine E-Mail-Adresse, damit wir dein Konto sichern und dein {{brandName}} Profil fertig einrichten koennen.",
      button: "E-Mail bestaetigen",
      closing: "Dieser Link laeuft aus Sicherheitsgruenden bald ab.",
    },
    googleSignup: {
      preheader: "Deine {{brandName}} Google-Anmeldung ist fertig.",
      eyebrow: "Google Anmeldung",
      title: "Du bist mit Google angemeldet",
      body:
        "Dein {{brandName}} Konto wurde mit Google erstellt. Du kannst jetzt Restaurants entdecken, Adressen speichern und schneller bestellen.",
      button: "Restaurants entdecken",
      closing: "Deine Google E-Mail ist bereits bestaetigt.",
    },
    forgotPassword: {
      preheader: "Setze dein {{brandName}} Passwort zurueck.",
      eyebrow: "Passwort zuruecksetzen",
      title: "Setze dein Passwort zurueck",
      body:
        "Wir haben eine Anfrage zum Zuruecksetzen deines {{brandName}} Passworts erhalten. Wenn du das warst, mach unten weiter. Falls nicht, kannst du diese E-Mail ignorieren.",
      button: "Passwort zuruecksetzen",
      closing: "Dieser Link ist 1 Stunde gueltig.",
    },
    resetSuccess: {
      preheader: "Dein {{brandName}} Passwort wurde geaendert.",
      eyebrow: "Passwort aktualisiert",
      title: "Passwort erfolgreich geaendert",
      body:
        "Dein {{brandName}} Passwort wurde aktualisiert. Falls du diese Aenderung nicht vorgenommen hast, kontaktiere sofort den Support.",
      button: "Zum Login",
      closing: "Aus Sicherheitsgruenden kann eine erneute Anmeldung erforderlich sein.",
    },
  },
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function withBrand(template, brandName) {
  return String(template || "").replace(/\{\{\s*brandName\s*\}\}/g, brandName);
}

async function resolveBrandName() {
  try {
    const settings = await getPlatformSettings();
    const name = String(settings?.platformName || "").trim();
    if (name) return name;
  } catch (error) {
    console.warn(
      "Failed to load platform settings for email brand:",
      error?.message || error
    );
  }
  return FALLBACK_BRAND_NAME;
}

function renderShell({
  lang,
  type,
  name,
  actionUrl,
  actionLabel,
  title,
  body,
  closing,
  brandName,
}) {
  const locale = copy[lang] || copy.en;
  const common = locale.common;
  const safeUrl = actionUrl ? escapeHtml(actionUrl) : "";
  const safeActionLabel = escapeHtml(actionLabel || "");
  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body);
  const safeClosing = escapeHtml(closing);
  const safeGreeting = escapeHtml(common.greeting(name));
  const preheader = escapeHtml(withBrand(locale[type].preheader, brandName));
  const eyebrow = escapeHtml(locale[type].eyebrow);
  const thanks = withBrand(common.thanks, brandName);
  const safeBrandName = escapeHtml(brandName);

  const html = `
    <!doctype html>
    <html lang="${lang}">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${safeTitle}</title>
      </head>
      <body style="margin:0;padding:0;background:${BRAND.page};font-family:Arial,Helvetica,sans-serif;color:${BRAND.ink};">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.page};padding:24px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:24px;overflow:hidden;box-shadow:0 24px 80px rgba(15,23,42,0.08);">
                <tr>
                  <td style="padding:24px 28px 18px;background:linear-gradient(180deg,#ffffff 0%,#f8fbff 100%);border-bottom:1px solid ${BRAND.border};">
                    <div style="display:inline-block;padding:8px 12px;border-radius:999px;background:${BRAND.accentSoft};color:${BRAND.accent};font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;">
                      ${eyebrow}
                    </div>
                    <div style="margin-top:18px;font-size:28px;line-height:1.15;font-weight:700;color:${BRAND.ink};">
                      ${safeTitle}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px;">
                    <p style="margin:0 0 14px;font-size:16px;line-height:1.7;color:${BRAND.ink};">${safeGreeting}</p>
                    <p style="margin:0 0 14px;font-size:16px;line-height:1.8;color:${BRAND.muted};">${safeBody}</p>
                    ${
                      safeUrl
                        ? `
                      <div style="margin:28px 0 22px;">
                        <a href="${safeUrl}" style="display:inline-block;background:${BRAND.accent};color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:14px;font-size:15px;font-weight:700;">
                          ${safeActionLabel}
                        </a>
                      </div>
                      <p style="margin:0 0 8px;font-size:13px;line-height:1.7;color:${BRAND.muted};">${escapeHtml(common.buttonFallback)}</p>
                      <p style="margin:0 0 18px;font-size:13px;line-height:1.7;word-break:break-all;">
                        <a href="${safeUrl}" style="color:${BRAND.accent};text-decoration:none;">${safeUrl}</a>
                      </p>
                    `
                        : ""
                    }
                    <p style="margin:0 0 14px;font-size:15px;line-height:1.8;color:${BRAND.muted};">${safeClosing}</p>
                    <p style="margin:22px 0 0;font-size:13px;line-height:1.7;color:${BRAND.muted};">${escapeHtml(common.help)}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 28px;border-top:1px solid ${BRAND.border};font-size:12px;line-height:1.7;color:${BRAND.muted};background:#fcfdff;">
                    <strong style="color:${BRAND.ink};">${safeBrandName}</strong><br />
                    ${escapeHtml(thanks)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  return {
    subject: safeTitle,
    html,
    text: [
      locale.common.greeting(name),
      body,
      actionUrl ? `${actionLabel}: ${actionUrl}` : "",
      closing,
      locale.common.help,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

async function renderAppUserEmail({ type, lang = "en", name, actionUrl }) {
  const locale = copy[lang] || copy.en;
  const block = locale[type] || locale.verifyEmail;
  const brandName = await resolveBrandName();

  return renderShell({
    lang,
    type,
    name,
    actionUrl,
    actionLabel: block.button,
    title: block.title,
    body: withBrand(block.body, brandName),
    closing: block.closing,
    brandName,
  });
}

module.exports = {
  renderAppUserEmail,
};
