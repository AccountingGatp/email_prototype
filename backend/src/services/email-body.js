/**
 * Normalize email HTML/text so marketing templates don't dump CSS into the UI.
 */

function decodeEntities(str = "") {
  return String(str)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

export function htmlToPlainText(html = "") {
  if (!html) return "";
  let s = String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li|blockquote|section|article|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ");
  s = decodeEntities(s);
  return s
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Detect bodyText that is mostly stripped CSS from HTML emails. */
export function looksLikeCssDump(text = "") {
  const s = String(text);
  if (!s) return false;
  const cssSignals =
    (s.match(/!important/gi) || []).length +
    (s.match(/\{[^}]{0,200}\}/g) || []).length +
    (s.match(/@media|line-height:|\.ExternalClass|webkit-text-size/gi) || []).length;
  return cssSignals >= 3 || /!important/.test(s) && /\{[^}]+\}/.test(s);
}

/** Remove leftover CSS rule blocks from already-stripped text. */
export function scrubCssNoise(text = "") {
  if (!text) return "";
  let s = String(text)
    .replace(/@media[^{]*\{[\s\S]*?\}\s*\}/gi, " ")
    .replace(/@media[^{]+/gi, " ")
    .replace(/[^{};\n]{0,120}\{[^}]*\}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

export function normalizeBodyText(bodyText = "", bodyHtml = "", snippet = "") {
  if (bodyHtml && (!bodyText?.trim() || looksLikeCssDump(bodyText))) {
    const fromHtml = htmlToPlainText(bodyHtml);
    if (fromHtml) return fromHtml;
  }

  if (looksLikeCssDump(bodyText)) {
    const scrubbed = scrubCssNoise(bodyText);
    if (scrubbed && scrubbed.length > 20) return scrubbed;
    if (snippet) return String(snippet).trim();
  }

  return String(bodyText || snippet || "").trim();
}
