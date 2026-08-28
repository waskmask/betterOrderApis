const SUPPORTED_LANGUAGES = ["en", "de"];

function normalizeLanguage(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (SUPPORTED_LANGUAGES.includes(normalized)) {
    return normalized;
  }

  if (normalized.startsWith("de")) {
    return "de";
  }

  if (normalized.startsWith("en")) {
    return "en";
  }

  return null;
}

function resolveRequestLanguage(req, fallback = "en") {
  const candidates = [
    req.body?.lang,
    req.query?.lang,
    req.cookies?.NEXT_LOCALE,
    req.cookies?.locale,
    req.cookies?.lang,
    req.headers["x-locale"],
    req.headers["x-lang"],
    req.headers["accept-language"],
  ];

  for (const candidate of candidates) {
    const resolved = normalizeLanguage(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return fallback;
}

module.exports = {
  normalizeLanguage,
  resolveRequestLanguage,
  SUPPORTED_LANGUAGES,
};
