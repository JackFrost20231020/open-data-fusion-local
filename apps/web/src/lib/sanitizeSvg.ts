/** Allowlisted SVG sanitizer used at import and at render. No DOM required. */

const ALLOWED_TAGS = new Set([
  "svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon",
  "text", "tspan", "defs", "clippath", "mask", "lineargradient", "radialgradient",
  "stop", "title", "desc", "symbol", "marker", "pattern", "image", "use", "switch",
]);

const ALLOWED_ATTR = new Set([
  "id", "class", "transform", "d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2",
  "width", "height", "fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap",
  "stroke-linejoin", "stroke-miterlimit", "stroke-opacity", "fill-opacity", "fill-rule",
  "opacity", "points", "viewbox", "xmlns", "xml:space", "font-size", "font-family",
  "font-weight", "font-style", "text-anchor", "dominant-baseline", "clip-path", "mask",
  "pointer-events", "vector-effect", "display", "visibility", "overflow", "dx", "dy",
  "rotate", "letter-spacing", "word-spacing", "gradientunits", "gradienttransform",
  "offset", "stop-color", "stop-opacity", "spreadmethod", "patternunits", "patterntransform",
  "marker-start", "marker-mid", "marker-end", "preserveaspectratio", "clippathunits",
  "maskunits", "pointname", "style", "href", "xlink:href", "src",
]);

function isAllowedAttrName(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.startsWith("on")) return false;
  if (lower.startsWith("xmlns:") || lower.startsWith("inkscape:") || lower.startsWith("sodipodi:") || lower.startsWith("serif:")) return true;
  return ALLOWED_ATTR.has(lower);
}

function isSafeUrl(value: string, tag: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("#")) return true;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("vbscript:") || lower.startsWith("data:text/html")) return false;
  if (tag === "image" && /^data:image\//i.test(trimmed)) return true;
  return false;
}

function parseAttrs(raw: string): Array<{ name: string; value: string }> {
  const attrs: Array<{ name: string; value: string }> = [];
  const pattern = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  for (const match of raw.matchAll(pattern)) {
    const name = match[1];
    if (!name) continue;
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    attrs.push({ name, value });
  }
  return attrs;
}

function serializeAttr(name: string, value: string): string {
  return `${name}="${value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}"`;
}


function escapeXmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function extractSafeLabel(html: string): string | null {
  const stripped = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  const text = stripped.replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
  if (!text || text.length > 8) return null;
  if (/javascript:|data:text\/html|<\s*script/i.test(text)) return null;
  if (!/^[\w\u4e00-\u9fff+\-/*%°μΩ]+$/u.test(text)) return null;
  return text;
}

/** Convert draw.io foreignObject labels into SVG text; never emit raw HTML. */
function rewriteForeignObjects(svg: string): string {
  return svg.replace(/<switch\b([^>]*)>([\s\S]*?)<\/switch>/gi, (_full, attrs: string, inner: string) => {
    const foMatch = inner.match(/<foreignObject\b([^>]*)>([\s\S]*?)<\/foreignObject>/i);
    const textMatch = inner.match(/<text\b([^>]*)>([\s\S]*?)<\/text>/i);
    const label = foMatch ? extractSafeLabel(foMatch[2] ?? "") : null;
    if (label && textMatch) {
      let textAttrs = textMatch[1] ?? "";
      const scale = `${foMatch?.[1] ?? ""}${foMatch?.[2] ?? ""}`.match(/scale\(\s*([0-9.]+)/i);
      if (scale?.[1]) {
        const factor = Number(scale[1]);
        if (Number.isFinite(factor) && factor > 0 && factor < 1) {
          textAttrs = textAttrs.replace(/font-size="([0-9.]+)(px)?"/i, (_m, n: string, unit: string | undefined) => {
            const size = Number(n) * factor;
            return `font-size="${size}${unit ?? ""}"`;
          });
        }
      }
      return `<switch${attrs}><text${textAttrs}>${escapeXmlText(label)}</text></switch>`;
    }
    const withoutFo = inner
      .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, "")
      .replace(/<text\b[^>]*>\s*\[Not supported by viewer\]\s*<\/text>/gi, "");
    return `<switch${attrs}>${withoutFo}</switch>`;
  }).replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, "");
}

function decodeCssEscapes(value: string): string {
  return value
    .replace(/\\([0-9a-fA-F]{1,6})(?:\r\n|[ \t\r\n\f])?/g, (_m, hex: string) => {
      const code = Number.parseInt(hex, 16);
      if (!Number.isFinite(code) || code === 0) return "";
      try { return String.fromCodePoint(code); } catch { return ""; }
    })
    .replace(/\\(.)/g, "$1");
}

function rewriteSafeCssUrls(value: string, allowDataImage: boolean): string {
  const decoded = decodeCssEscapes(value);
  return decoded.replace(/url\s*\(\s*(['"]?)\s*([\s\S]*?)\s*\1\s*\)/gi, (_full, _q: string, inner: string) => {
    const target = decodeCssEscapes(inner).trim().replace(/^['"]|['"]$/g, "");
    if (target.startsWith("#")) return `url(${target})`;
    if (allowDataImage && /^data:image\//i.test(target)) return `url(${target})`;
    return "";
  });
}

function sanitizeStyleValue(value: string): string {
  return rewriteSafeCssUrls(value, false)
    .replace(/expression\s*\(/gi, "")
    .replace(/-moz-binding/gi, "")
    .replace(/@import/gi, "");
}

const PAINT_REF_ATTR = new Set([
  "fill", "stroke", "filter", "clip-path", "clippath", "mask",
  "marker-start", "marker-mid", "marker-end", "flood-color", "lighting-color",
  "stop-color", "color", "xlink:href",
]);

function sanitizeRefOrPaintValue(attrName: string, value: string, tag: string): string | null {
  const lower = attrName.toLowerCase();
  const decoded = decodeCssEscapes(value).trim();
  if (lower === "href" || lower === "xlink:href" || lower === "src") {
    if (!isSafeUrl(decoded, tag)) return null;
    return decoded;
  }
  if (!PAINT_REF_ATTR.has(lower) && !/url\s*\(/i.test(decoded)) return value;
  if (/^(javascript:|vbscript:|data:text\/html|https?:|ftp:|\/\/)/i.test(decoded)) return null;
  const cleaned = rewriteSafeCssUrls(decoded, false).trim();
  if (/url\s*\(/i.test(decodeCssEscapes(value)) && !cleaned) return null;
  return cleaned || null;
}

export function sanitizeSvg(input: string | null | undefined): string {
  if (input == null) return "";
  const source = String(input);
  if (!source.trim()) return "";

  let svg = rewriteForeignObjects(source)
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<\?xml[\s\S]*?\?>/gi, "");

  svg = svg.replace(/<\/?([a-zA-Z][\w:-]*)([^>]*)>/g, (full, rawName: string, rawAttrs: string) => {
    const closing = full.startsWith("</");
    const selfClosing = /\/>\s*$/.test(full);
    const name = String(rawName).toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return "";
    if (closing) return `</${rawName}>`;

    const kept: string[] = [];
    for (const attr of parseAttrs(rawAttrs)) {
      const attrName = attr.name;
      if (!isAllowedAttrName(attrName)) continue;
      const lower = attrName.toLowerCase();
      if (lower === "style") {
        kept.push(serializeAttr(attrName, sanitizeStyleValue(attr.value)));
        continue;
      }
      if (lower === "href" || lower === "xlink:href" || lower === "src" || PAINT_REF_ATTR.has(lower) || /url\s*\(/i.test(attr.value) || /\\[0-9a-fA-F]/.test(attr.value)) {
        const cleaned = sanitizeRefOrPaintValue(attrName, attr.value, name);
        if (cleaned == null) continue;
        kept.push(serializeAttr(attrName, cleaned));
        continue;
      }
      kept.push(serializeAttr(attrName, attr.value));
    }
    const body = kept.length ? ` ${kept.join(" ")}` : "";
    return selfClosing ? `<${rawName}${body}/>` : `<${rawName}${body}>`;
  });

  // Drop leftover event-handler text from truncated/unclosed tags.
  svg = svg.replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  svg = svg.replace(/<([a-zA-Z][\w:-]*)[^>]*$/g, "");
  // Residual text (e.g. from dropped <style> tags) must not keep external urls.
  // Do not CSS-decode the whole document: that would corrupt path data and labels.
  svg = svg.replace(/url\s*\(\s*(['"]?)(?!#|data:image\/)[^)]*\1\s*\)/gi, "");
  return svg;
}

export function svgLooksEmpty(value: string | null | undefined): boolean {
  return !value || !String(value).trim();
}
