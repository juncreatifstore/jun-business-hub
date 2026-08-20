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

const SAFE_DRAW_PREFIX = "data:image/png;base64,";
const MAX_DRAW_DATA_URL = 750_000;

function safeImageSrc(src: string | undefined): string {
  const value = src ?? "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith(SAFE_DRAW_PREFIX) && value.length <= MAX_DRAW_DATA_URL && /^[A-Za-z0-9+/=]+$/.test(value.slice(SAFE_DRAW_PREFIX.length))) return value;
  return "";
}

export function sanitizeDocumentHtml(dirty: string): string {
  return sanitizeHtml(dirty ?? "", {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "rel", "target"],
      img: ["src", "alt", "title", "width", "height", "data-jun-image", "data-jun-draw"],
      th: ["colspan", "rowspan"],
      td: ["colspan", "rowspan"],
      p: ["style"],
      h1: ["style"], h2: ["style"], h3: ["style"],
      mark: ["data-jun-mark"],
      span: ["data-jun-mark"],
      div: [
        "data-jun-block", "data-kind", "data-text",
        "data-jun-field", "data-field-type", "data-field-name", "data-required",
        "data-help", "data-options", "data-order", "data-validation", "data-formula",
        "data-jun-page", "data-page-id", "data-rotation",
      ],
    },
    allowedSchemes: ["http", "https", "mailto", "tel", "data"],
    allowedSchemesAppliedToAttributes: ["href", "src"],
    allowedStyles: {
      "*": { "text-align": [/^(left|right|center|justify)$/] },
    },
    disallowedTagsMode: "discard",
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: { ...attribs, rel: "noopener noreferrer nofollow", target: "_blank" },
      }),
      img: (_tagName, attribs) => {
        const src = safeImageSrc(attribs.src);
        const isDraw = src.startsWith(SAFE_DRAW_PREFIX);
        return {
          tagName: "img",
          attribs: {
            src,
            alt: (attribs.alt ?? (isDraw ? "Hand drawing" : "Document image")).slice(0, 300),
            title: (attribs.title ?? "").slice(0, 300),
            width: String(Math.min(1200, Math.max(1, Number(attribs.width) || (isDraw ? 640 : 640)))),
            height: String(Math.min(1600, Math.max(1, Number(attribs.height) || (isDraw ? 176 : 360)))),
            "data-jun-image": "true",
            ...(isDraw ? { "data-jun-draw": "true" } : {}),
          },
        };
      },
      div: (_tagName, attribs) => {
        if (attribs["data-jun-page"] === "true") {
          const rotation = ["0", "90", "180", "270"].includes(attribs["data-rotation"]) ? attribs["data-rotation"] : "0";
          return { tagName: "div", attribs: { "data-jun-page": "true", "data-page-id": (attribs["data-page-id"] ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80), "data-rotation": rotation } };
        }
        return { tagName: "div", attribs };
      },
    },
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
