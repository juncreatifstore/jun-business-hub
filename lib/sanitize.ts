import "server-only";
import sanitizeHtml from "sanitize-html";

/**
 * Server-side HTML sanitization for document content (editor output, AI drafts,
 * template rendering). Strict whitelist — everything else is stripped.
 * NEVER render user/AI-supplied HTML without passing it through here first.
 */
const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "p", "br", "hr",
  "strong", "b", "em", "i", "u", "s", "sub", "sup", "mark", "code", "pre",
  "ul", "ol", "li", "blockquote",
  "table", "thead", "tbody", "tr", "th", "td",
  "a", "span", "div",
];

export function sanitizeDocumentHtml(dirty: string): string {
  return sanitizeHtml(dirty ?? "", {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "rel", "target"],
      th: ["colspan", "rowspan"],
      td: ["colspan", "rowspan"],
      p: ["style"],
      h1: ["style"], h2: ["style"], h3: ["style"],
      span: [], div: [],
    },
    // Only safe protocols; blocks javascript:, data:, vbscript: …
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesAppliedToAttributes: ["href"],
    // text-align only (Tiptap alignment) — everything else stripped
    allowedStyles: {
      "*": { "text-align": [/^(left|right|center|justify)$/] },
    },
    disallowedTagsMode: "discard",
    // Force safe link behavior
    transformTags: {
      a: (tagName, attribs) => ({
        tagName: "a",
        attribs: { ...attribs, rel: "noopener noreferrer nofollow", target: "_blank" },
      }),
    },
    // sanitize-html strips event handlers (on*) and script/iframe/object/embed
    // by virtue of the whitelist; keep parser defaults strict.
    parseStyleAttributes: true,
  });
}

/** Plain-text extraction (for AI context minimization, previews, PDF fallback). */
export function htmlToText(html: string): string {
  return sanitizeHtml(html ?? "", { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
