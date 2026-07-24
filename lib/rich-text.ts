const allowedTags = new Set(["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a", "blockquote", "h1", "h2", "h3", "h4", "div"]);

export function normalizeRichTextLinkUrl(input: string) {
  const value = input.trim().replace(/&amp;/gi, "&");
  if (!value) return null;
  if (/^https?:\/\/[^\s]+$/i.test(value) || /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value)) return value;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value)) return `mailto:${value}`;
  if (/^(?:www\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?::\d+)?(?:[/?#][^\s]*)?$/i.test(value)) {
    return `https://${value}`;
  }
  return null;
}

function sanitizeAttributes(tagName: string, attrs: string) {
  if (tagName !== "a") return "";
  const hrefMatch = attrs.match(/href\s*=\s*(["'])(.*?)\1/i);
  const rawHref = hrefMatch?.[2]?.trim() ?? "";
  const href = /^\{\{[a-z0-9_]+\}\}$/i.test(rawHref) ? rawHref : normalizeRichTextLinkUrl(rawHref);
  if (!href) return "";
  const escaped = href.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return ` href="${escaped}" target="_blank" rel="noopener noreferrer"`;
}

function escapeText(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function plainTextLineBreaksToHtml(value: string) {
  return value.replace(/\r\n?/g, "\n").split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean)
    .map((paragraph) => `<p>${paragraph.split(/\n/).map((line) => escapeText(line.trim())).join("<br>")}</p>`).join("");
}

export function sanitizeRichText(input: string | undefined) {
  if (!input) return "";
  const withoutDangerousBlocks = input
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/on\w+\s*=\s*(["'])[\s\S]*?\1/gi, "")
    .replace(/javascript:/gi, "");
  const normalized = !/<\/?[a-z][\s\S]*>/i.test(withoutDangerousBlocks) && /[\r\n]/.test(withoutDangerousBlocks)
    ? plainTextLineBreaksToHtml(withoutDangerousBlocks)
    : withoutDangerousBlocks;
  const withoutDeadAnchors = normalized.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_full, attrs, content) => {
    const cleanAttributes = sanitizeAttributes("a", String(attrs));
    return cleanAttributes.includes(" href=") ? `<a${cleanAttributes}>${content}</a>` : content;
  });
  return withoutDeadAnchors.replace(/<\/?([a-z0-9-]+)([^>]*)>/gi, (full, tag, attrs) => {
    const tagName = String(tag).toLowerCase();
    if (!allowedTags.has(tagName)) return "";
    if (full.startsWith("</")) return `</${tagName}>`;
    return `<${tagName}${sanitizeAttributes(tagName, String(attrs))}>`;
  }).trim();
}

export function stripRichTextToPlain(value: string) {
  return value.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|ul|ol|h1|h2|h3|h4|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#039;/gi, "'").replace(/\s+/g, " ").trim();
}
