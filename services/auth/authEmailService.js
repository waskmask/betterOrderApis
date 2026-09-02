const { sendAppUserEmail } = require("../email/transactionalEmailService");
const { buildAuthEmailData } = require("../email/orderEmailData");
const {
  createVerificationToken,
  createPasswordResetToken,
  EMAIL_VERIFICATION_TTL_MS,
  buildVerificationUrl,
  buildPasswordResetUrl,
} = require("./authTokenService");

async function sendAuthEmail({ appUser, template, actionUrl = null }) {
  const lang = appUser.preferredLanguage || "en";
  const data = buildAuthEmailData({
    name: appUser.name,
    actionUrl,
    lang,
  });
  const emailResult = await sendAppUserEmail({
    to: appUser.email,
    lang,
    type: template,
    name: data.name,
    actionUrl: data.actionUrl,
  });

  const preview =
    process.env.NODE_ENV !== "production" || !emailResult.sent
      ? {
          delivery: emailResult.sent ? "smtp" : emailResult.reason,
          actionUrl,
          type: template,
          lang,
        }
      : null;

  return { emailResult, preview };
}

async function issueVerificationEmail(appUser) {
  const lang = appUser.preferredLanguage || "en";
  const token = createVerificationToken();
  appUser.emailVerificationTokenHash = token.hash;
  appUser.emailVerificationTokenExpiresAt = token.expiresAt;
  appUser.verificationEmailLastSentAt = new Date();
  await appUser.save();

  const verificationUrl = buildVerificationUrl(token.raw);
  const emailResult = await sendAuthEmail({
    appUser,
    template: "verifyEmail",
    actionUrl: verificationUrl,
  });

  const preview =
    process.env.NODE_ENV !== "production" || !emailResult.emailResult.sent
      ? {
          verificationUrl,
          verificationToken: token.raw,
          delivery: emailResult.emailResult.sent ? "smtp" : emailResult.emailResult.reason,
        }
      : null;

  return {
    emailResult: emailResult.emailResult,
    preview,
    expiresAt: token.expiresAt,
    expiresInSeconds: Math.floor(EMAIL_VERIFICATION_TTL_MS / 1000),
  };
}

async function issuePasswordResetEmail(appUser) {
  const token = createPasswordResetToken();
  appUser.passwordResetTokenHash = token.hash;
  appUser.passwordResetTokenExpiresAt = token.expiresAt;
  appUser.passwordResetLastSentAt = new Date();
  await appUser.save();

  const resetUrl = buildPasswordResetUrl(token.raw);
  const email = await sendAuthEmail({
    appUser,
    template: "forgotPassword",
    actionUrl: resetUrl,
  });

  const preview =
    process.env.NODE_ENV !== "production" || !email.emailResult.sent
      ? {
          resetUrl,
          resetToken: token.raw,
          delivery: email.emailResult.sent ? "smtp" : email.emailResult.reason,
        }
      : null;

  return { emailResult: email.emailResult, preview };
}

module.exports = {
  sendAuthEmail,
  issueVerificationEmail,
  issuePasswordResetEmail,
};
