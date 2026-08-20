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
  "a", "span", "div", "img",
];

export function sanitizeDocumentHtml(dirty: string): string {
  return sanitizeHtml(dirty ?? "", {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "rel", "target"],
      img: ["src", "alt", "title", "width", "height", "data-jun-image"],
      th: ["colspan", "rowspan"],
      td: ["colspan", "rowspan"],
      p: ["style"],
      h1: ["style"], h2: ["style"], h3: ["style"],
      mark: ["data-jun-mark"],
      span: ["data-jun-mark"],
      div: ["data-jun-block", "data-kind", "data-text"],
    },
    // Only safe protocols. Image sources deliberately exclude data: and javascript:.
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesAppliedToAttributes: ["href", "src"],
    // Tiptap text alignment only. Annotation appearance is reconstructed by the
    // editor from data-jun-* attributes rather than trusting arbitrary CSS.
    allowedStyles: {
      "*": { "text-align": [/^(left|right|center|justify)$/] },
    },
    disallowedTagsMode: "discard",
    // Force safe link behavior and normalized safe image attributes.
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: { ...attribs, rel: "noopener noreferrer nofollow", target: "_blank" },
      }),
      img: (_tagName, attribs) => ({
        tagName: "img",
        attribs: {
          src: attribs.src ?? "",
          alt: (attribs.alt ?? "Document image").slice(0, 300),
          title: (attribs.title ?? "").slice(0, 300),
          width: String(Math.min(1200, Math.max(1, Number(attribs.width) || 640))),
          height: String(Math.min(1600, Math.max(1, Number(attribs.height) || 360))),
          "data-jun-image": "true",
        },
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
