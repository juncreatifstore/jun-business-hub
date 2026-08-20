export type JunDocumentPage = { id: string; rotation: 0 | 90 | 180 | 270; html: string };

const PAGE_RE = /<div\b[^>]*data-jun-page=["']true["'][^>]*><\/div>/gi;

function attr(tag: string, name: string): string {
  return tag.match(new RegExp(`${name}=["']([^"']*)["']`, "i"))?.[1] ?? "";
}

function pageId() {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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
    const rotationRaw = Number(attr(marker, "data-rotation"));
    const rotation = ([0, 90, 180, 270].includes(rotationRaw) ? rotationRaw : 0) as 0 | 90 | 180 | 270;
    pages.push({ id: attr(marker, "data-page-id") || pageId(), rotation, html: source.slice(start, end).trim() || "<p></p>" });
  }
  const before = source.slice(0, matches[0].index ?? 0).trim();
  if (before) pages.unshift({ id: pageId(), rotation: 0, html: before });
  return pages.length ? pages : [{ id: pageId(), rotation: 0, html: "<p></p>" }];
}

export function serializeDocumentPages(pages: JunDocumentPage[]): string {
  const safe = pages.length ? pages : [{ id: pageId(), rotation: 0 as const, html: "<p></p>" }];
  return safe.map((p) => `<div data-jun-page="true" data-page-id="${p.id.replace(/[^a-zA-Z0-9_-]/g, "")}" data-rotation="${p.rotation}"></div>${p.html || "<p></p>"}`).join("");
}

export function newBlankPage(): JunDocumentPage {
  return { id: pageId(), rotation: 0, html: "<p></p>" };
}
