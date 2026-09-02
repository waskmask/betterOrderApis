function getClientIp(req) {
  return (
    String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function normalizeKeyPart(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .slice(0, 160);
}

function createRateLimiter({
  windowMs,
  max,
  keyPrefix,
  keyGenerator,
  message = "too_many_requests",
}) {
  const hits = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const rawKey = keyGenerator ? keyGenerator(req) : getClientIp(req);
    const key = `${keyPrefix}:${normalizeKeyPart(rawKey) || getClientIp(req)}`;
    const entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;

    if (entry.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        success: false,
        message,
        retryAfterSeconds,
      });
    }

    return next();
  };
}

function emailOrIp(req) {
  return req.body?.email
    ? `${getClientIp(req)}:${req.body.email}`
    : getClientIp(req);
}

function tokenOrIp(req) {
  return req.body?.token
    ? `${getClientIp(req)}:${req.body.token}`
    : getClientIp(req);
}

const authLoginLimiter = createRateLimiter({
  keyPrefix: "auth-login",
  windowMs: 15 * 60 * 1000,
  max: 8,
  keyGenerator: emailOrIp,
});

const authRegisterLimiter = createRateLimiter({
  keyPrefix: "auth-register",
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: emailOrIp,
});

const authGoogleLimiter = createRateLimiter({
  keyPrefix: "auth-google",
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: getClientIp,
});

const emailSendLimiter = createRateLimiter({
  keyPrefix: "email-send",
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: emailOrIp,
});

const tokenActionLimiter = createRateLimiter({
  keyPrefix: "token-action",
  windowMs: 15 * 60 * 1000,
  max: 12,
  keyGenerator: tokenOrIp,
});

const passwordChangeLimiter = createRateLimiter({
  keyPrefix: "password-change",
  windowMs: 60 * 60 * 1000,
  max: 6,
  keyGenerator: (req) => `${getClientIp(req)}:${req.user?._id || ""}`,
});

const reviewSubmitLimiter = createRateLimiter({
  keyPrefix: "review-submit",
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: tokenOrIp,
});

module.exports = {
  authGoogleLimiter,
  authLoginLimiter,
  authRegisterLimiter,
  emailSendLimiter,
  passwordChangeLimiter,
  tokenActionLimiter,
  reviewSubmitLimiter,
};
