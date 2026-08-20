export type JunDocumentPage = { id: string; rotation: 0 | 90 | 180 | 270; html: string };

const PAGE_RE = /<div\b[^>]*data-jun-block=["']true["'][^>]*data-kind=["']page["'][^>]*>[\s\S]*?<\/div>/gi;

function attr(tag: string, name: string): string {
  return tag.match(new RegExp(`${name}=["']([^"']*)["']`, "i"))?.[1] ?? "";
}

function pageId() {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseMeta(marker: string) {
  const raw = attr(marker, "data-text") || marker.replace(/<[^>]+>/g, "").trim();
  const [idRaw, rotationRaw] = raw.split("|");
  const rotationNumber = Number(rotationRaw || 0);
  return {
    id: (idRaw || pageId()).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80),
    rotation: ([0, 90, 180, 270].includes(rotationNumber) ? rotationNumber : 0) as 0 | 90 | 180 | 270,
  };
}

export function parseDocumentPages(html: string): JunDocumentPage[] {
  const source = html || "<p></p>";
  const matches = [...source.matchAll(PAGE_RE)];
  if (!matches.length) return [{ id: pageId(), rotation: 0, html: source }];
  const pages: JunDocumentPage[] = [];
  for (let i = 0; i < matches.length; i++) {
    const marker = matches[i][0];
    const start = (matches[i].index ?? 0) + marker.length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? source.length) : source.length;
    const meta = parseMeta(marker);
    pages.push({ ...meta, html: source.slice(start, end).trim() || "<p></p>" });
  }
  const before = source.slice(0, matches[0].index ?? 0).trim();
  if (before) pages.unshift({ id: pageId(), rotation: 0, html: before });
  return pages.length ? pages : [{ id: pageId(), rotation: 0, html: "<p></p>" }];
}

export function serializeDocumentPages(pages: JunDocumentPage[]): string {
  const safe = pages.length ? pages : [{ id: pageId(), rotation: 0 as const, html: "<p></p>" }];
  return safe.map((p) => {
    const id = p.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || pageId();
    const meta = `${id}|${p.rotation}`;
    return `<div data-jun-block="true" data-kind="page" data-text="${meta}">${meta}</div>${p.html || "<p></p>"}`;
  }).join("");
}

export function newBlankPage(): JunDocumentPage {
  return { id: pageId(), rotation: 0, html: "<p></p>" };
}
