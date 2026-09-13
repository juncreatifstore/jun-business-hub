import "server-only";
import { appBaseUrl } from "@/lib/document-requests";

/**
 * Branded HTML e-mail. Every automated message goes through this so clients
 * see one consistent identity: dark header with the wordmark, a clear title,
 * short paragraphs, an optional call-to-action button, an optional detail
 * table, and a footer with contact and legal lines. Inline CSS only
 * (e-mail clients), no external assets, plus a plain-text fallback.
 */
export type EmailBlock =
  | { type: "p"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; rows: Array<[string, string]> }
  | { type: "note"; text: string }
  | { type: "button"; label: string; url: string }
  | { type: "hr" };

export type EmailInput = {
  lang?: "fr" | "en";
  preheader?: string;
  title: string;
  greeting?: string | null;
  blocks: EmailBlock[];
  signoff?: string | null;
  /** Small line above the footer (e.g. reference). */
  meta?: string | null;
};

const BRAND = {
  name: "JUN CREATIF AND TRAVEL LLC",
  short: "JUN Creatif & Travel",
  primary: "#2563eb",
  dark: "#0b1220",
  text: "#1f2937",
  muted: "#6b7280",
  border: "#e5e7eb",
  bg: "#f3f4f6",
};

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const nl = (v: string) => esc(v).replace(/\n/g, "<br>");

function blockHtml(b: EmailBlock): string {
  switch (b.type) {
    case "p":
      return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${BRAND.text}">${nl(b.text)}</p>`;
    case "list":
      return `<ul style="margin:0 0 14px;padding-left:20px;font-size:15px;line-height:1.7;color:${BRAND.text}">${b.items.map((i) => `<li>${nl(i)}</li>`).join("")}</ul>`;
    case "table":
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border-collapse:collapse;width:100%;font-size:14px">${b.rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:8px 10px;border:1px solid ${BRAND.border};background:#fafafa;color:${BRAND.muted};width:40%">${esc(k)}</td><td style="padding:8px 10px;border:1px solid ${BRAND.border};color:${BRAND.text}"><strong>${nl(v)}</strong></td></tr>`,
        )
        .join("")}</table>`;
    case "note":
      return `<div style="margin:0 0 16px;padding:12px 14px;border-left:4px solid ${BRAND.primary};background:#eff6ff;font-size:14px;line-height:1.6;color:${BRAND.text}">${nl(b.text)}</div>`;
    case "button":
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 20px"><tr><td style="border-radius:8px;background:${BRAND.primary}"><a href="${esc(b.url)}" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${esc(b.label)}</a></td></tr></table><p style="margin:-10px 0 18px;font-size:12px;color:${BRAND.muted};word-break:break-all">${esc(b.url)}</p>`;
    case "hr":
      return `<hr style="border:0;border-top:1px solid ${BRAND.border};margin:18px 0">`;
  }
}

function blockText(b: EmailBlock): string {
  switch (b.type) {
    case "p":
      return b.text;
    case "list":
      return b.items.map((i) => `  • ${i}`).join("\n");
    case "table":
      return b.rows.map(([k, v]) => `${k} : ${v}`).join("\n");
    case "note":
      return `> ${b.text}`;
    case "button":
      return `${b.label} : ${b.url}`;
    case "hr":
      return "—";
  }
}

export function renderEmail(input: EmailInput): { html: string; text: string; short: string } {
  const fr = (input.lang ?? "fr") === "fr";
  const site = appBaseUrl();
  const greeting = input.greeting ?? null;
  const signoff =
    input.signoff === undefined
      ? fr
        ? `Cordialement,\n${BRAND.name}`
        : `Kind regards,\n${BRAND.name}`
      : input.signoff;
  const footer = fr
    ? `Cet e-mail est envoyé automatiquement par ${BRAND.name}. Pour toute question, répondez à ce message ou écrivez à contact@juncreatifs.org.`
    : `This e-mail is sent automatically by ${BRAND.name}. For any question, reply to this message or write to contact@juncreatifs.org.`;
  const html = `<!doctype html><html lang="${fr ? "fr" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(input.title)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
${input.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(input.preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${BRAND.border}">
<tr><td style="background:${BRAND.dark};padding:22px 28px">
  <div style="font-size:18px;font-weight:700;letter-spacing:.2px;color:#ffffff">JUN <span style="color:#93c5fd">Business Hub</span></div>
  <div style="font-size:12px;color:#94a3b8;margin-top:2px">${esc(BRAND.short)}</div>
</td></tr>
<tr><td style="padding:28px 28px 8px">
  <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${BRAND.dark}">${esc(input.title)}</h1>
  ${greeting ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${BRAND.text}">${nl(greeting)}</p>` : ""}
  ${input.blocks.map(blockHtml).join("\n")}
  ${signoff ? `<p style="margin:18px 0 0;font-size:15px;line-height:1.6;color:${BRAND.text}">${nl(signoff)}</p>` : ""}
</td></tr>
${input.meta ? `<tr><td style="padding:0 28px 12px;font-size:12px;color:${BRAND.muted}">${nl(input.meta)}</td></tr>` : ""}
<tr><td style="padding:16px 28px 22px;border-top:1px solid ${BRAND.border};font-size:12px;line-height:1.6;color:${BRAND.muted}">
  ${esc(footer)}<br>
  <a href="${esc(site)}" style="color:${BRAND.primary};text-decoration:none">${esc(site.replace(/^https?:\/\//, ""))}</a>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
  const text = [greeting, ...input.blocks.map(blockText), signoff, input.meta, "", footer]
    .filter((v): v is string => Boolean(v))
    .join("\n\n");
  // Short form for chat channels (WhatsApp): greeting, key blocks, link, signature — no footer.
  const short = [
    greeting,
    ...input.blocks
      .filter((b) => b.type === "p" || b.type === "note" || b.type === "list" || b.type === "button")
      .slice(0, 4)
      .map((b) => (b.type === "button" ? b.url : blockText(b))),
    BRAND.name,
  ]
    .filter((v): v is string => Boolean(v))
    .join("\n\n");
  return { html, text, short };
}
