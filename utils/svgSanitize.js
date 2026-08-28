/**
 * Sanitize AI/uploaded SVG for safe storage and rendering.
 * Strips scripts, event handlers, foreignObject, external refs.
 */
function extractSvgMarkup(raw) {
  const text = String(raw || "").trim();
  const fenced = text.match(/```(?:svg)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1]?.trim() || text;
  const start = candidate.search(/<svg\b/i);
  const end = candidate.toLowerCase().lastIndexOf("</svg>");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return candidate.slice(start, end + "</svg>".length).trim();
}

function sanitizeSvg(raw) {
  const markup = extractSvgMarkup(raw);
  if (!markup) {
    return { ok: false, message: "invalid_svg" };
  }

  let svg = markup;

  // Remove dangerous elements
  svg = svg.replace(/<\s*(script|foreignObject|iframe|object|embed|link|meta)\b[\s\S]*?<\/\s*\1\s*>/gi, "");
  svg = svg.replace(/<\s*(script|foreignObject|iframe|object|embed|link|meta)\b[^>]*\/?\s*>/gi, "");

  // Remove event handlers and javascript: URLs
  svg = svg.replace(/\son[a-z]+\s*=\s*(['"])[\s\S]*?\1/gi, "");
  svg = svg.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");
  svg = svg.replace(/(href|xlink:href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, '$1=""');
  svg = svg.replace(/(href|xlink:href|src)\s*=\s*(['"])\s*data:(?!image\/svg\+xml)[\s\S]*?\2/gi, '$1=""');

  // Block external http(s) asset refs (keep relative/fragment only)
  svg = svg.replace(
    /(href|xlink:href|src)\s*=\s*(['"])\s*https?:\/\/[\s\S]*?\2/gi,
    '$1=""'
  );

  // Ensure viewBox exists
  if (!/\bviewBox\s*=/i.test(svg)) {
    svg = svg.replace(/<svg\b/i, '<svg viewBox="0 0 100 100"');
  }

  // Prefer transparent / no forced background
  if (!/^<svg\b/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) {
    return { ok: false, message: "invalid_svg" };
  }

  // Size guard (~200KB text)
  if (Buffer.byteLength(svg, "utf8") > 200 * 1024) {
    return { ok: false, message: "svg_too_large" };
  }

  return { ok: true, svg };
}

module.exports = {
  extractSvgMarkup,
  sanitizeSvg,
};
