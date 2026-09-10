"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Renders an email body in a sandboxed iframe.
 *
 * Mobile strategy, in order:
 *  1. Injected CSS neutralises fixed widths (`width="600"`, `min-width`, `white-space:nowrap`)
 *     so responsive-ish emails reflow naturally.
 *  2. If the document is still wider than the frame (old-school table layouts with
 *     absolute pixel cells), the whole body is scaled down to fit — the same fallback
 *     Gmail and Apple Mail use. Text stays readable because we never scale below 0.5.
 */
export function EmailHtmlFrame({ html, title }: { html: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(240);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let observer: ResizeObserver | undefined;
    let frameObserver: ResizeObserver | undefined;

    const fit = () => {
      try {
        const doc = frame.contentDocument;
        const root = doc?.getElementById("jun-root");
        if (!doc || !root) return;
        const available = frame.clientWidth || doc.documentElement.clientWidth;
        // Reset before measuring so the scale is recomputed on orientation change.
        root.style.transform = "";
        root.style.width = "";
        const natural = Math.max(root.scrollWidth, doc.documentElement.scrollWidth);
        let scale = 1;
        if (available > 0 && natural > available + 2) {
          scale = Math.max(0.5, available / natural);
          root.style.transformOrigin = "top left";
          root.style.transform = `scale(${scale})`;
          root.style.width = `${natural}px`;
        }
        const h = Math.max(root.scrollHeight, doc.body?.scrollHeight ?? 0, 120) * scale;
        setHeight(Math.min(Math.max(Math.ceil(h) + 16, 120), 8000));
      } catch {}
    };

    const onLoad = () => {
      fit();
      try {
        const doc = frame.contentDocument;
        const root = doc?.getElementById("jun-root");
        if (root) {
          observer = new ResizeObserver(fit);
          observer.observe(root);
        }
        doc?.querySelectorAll("img").forEach((img) => img.addEventListener("load", fit, { once: true }));
      } catch {}
      frameObserver = new ResizeObserver(fit);
      frameObserver.observe(frame);
    };

    frame.addEventListener("load", onLoad);
    return () => {
      frame.removeEventListener("load", onLoad);
      observer?.disconnect();
      frameObserver?.disconnect();
    };
  }, [html]);

  const css = `
    html,body{margin:0;padding:0;background:#fff;color:#0f172a;overflow-x:hidden;-webkit-text-size-adjust:100%}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;overflow-wrap:anywhere;word-break:break-word}
    #jun-root{min-width:0}
    img,video,iframe{max-width:100% !important;height:auto}
    table{max-width:100% !important;border-collapse:collapse}
    table[width],td[width],th[width],div[style*="width"],table[style*="width"]{max-width:100% !important}
    *[style*="min-width"]{min-width:0 !important}
    *[style*="white-space: nowrap"],*[style*="white-space:nowrap"]{white-space:normal !important}
    pre{white-space:pre-wrap}
    a{color:#1d4ed8}
    blockquote{margin:0 0 0 .5em;padding-left:.75em;border-left:2px solid #e2e8f0;color:#475569}
  `;
  const document = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="jun-root">${html}</div></body></html>`;

  return (
    <iframe
      ref={ref}
      title={title}
      srcDoc={document}
      loading="lazy"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      className="block w-full border-0 bg-white"
      style={{ height }}
    />
  );
}
