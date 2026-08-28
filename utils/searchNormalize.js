/**
 * Accent/diacritic folding for search.
 * Example: "Doner" matches "Döner".
 */
function normalizeForSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ß/gi, "ss")
    .replace(/æ/gi, "ae")
    .replace(/œ/gi, "oe")
    .replace(/ø/gi, "o")
    .replace(/đ/gi, "d")
    .replace(/ł/gi, "l")
    .toLowerCase()
    .trim();
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Base Latin letter → matching class including common diacritics. */
const DIACRITIC_CLASS = {
  a: "aàáâãäåāăą",
  e: "eèéêëēėęě",
  i: "iìíîïīįı",
  o: "oòóôõöőøō",
  u: "uùúûüűūů",
  c: "cçćč",
  n: "nñńň",
  s: "sśšş",
  y: "yýÿŷ",
  d: "dďđ",
  g: "gğġ",
  l: "lłľĺ",
  r: "rřŕ",
  t: "tťţ",
  z: "zžźż",
};

/**
 * Build a case-insensitive regex that treats ASCII letters as matching
 * their accented variants (and the reverse after folding the query).
 */
function buildDiacriticInsensitiveRegex(input) {
  const base = normalizeForSearch(input);
  if (!base) return null;

  let source = "";
  for (let i = 0; i < base.length; i += 1) {
    const ch = base[i];
    if (ch === "s" && base[i + 1] === "s") {
      source += "(?:ss|ß)";
      i += 1;
      continue;
    }
    const group = DIACRITIC_CLASS[ch];
    source += group ? `[${group}]` : escapeRegex(ch);
  }

  return new RegExp(source, "i");
}

module.exports = {
  normalizeForSearch,
  escapeRegex,
  buildDiacriticInsensitiveRegex,
};
