import { Mark, Node, mergeAttributes } from "@tiptap/core";

export const JunHighlight = Mark.create({
  name: "junHighlight",
  parseHTML() {
    return [{ tag: 'mark[data-jun-mark="highlight"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["mark", mergeAttributes(HTMLAttributes, {
      "data-jun-mark": "highlight",
      style: "background:#fef08a;color:inherit;padding:0 .08em;border-radius:.12em",
    }), 0];
  },
  addCommands() {
    return {
      toggleJunHighlight: () => ({ commands }) => commands.toggleMark(this.name),
    } as any;
  },
});

export const JunBlackout = Mark.create({
  name: "junBlackout",
  parseHTML() {
    return [{ tag: 'span[data-jun-mark="blackout"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, {
      "data-jun-mark": "blackout",
      style: "background:#111827;color:#111827;border-radius:.08em;padding:0 .05em",
      title: "Redacted",
    }), 0];
  },
  addCommands() {
    return {
      toggleJunBlackout: () => ({ commands }) => commands.toggleMark(this.name),
    } as any;
  },
});

const BLOCK_STYLE: Record<string, string> = {
  textbox: "border:1px solid #94a3b8;background:#ffffff;padding:12px 14px;border-radius:6px;margin:10px 0;white-space:pre-wrap",
  sticky: "border:1px solid #f59e0b;background:#fffbeb;padding:12px 14px;border-radius:6px;margin:10px 0;white-space:pre-wrap",
  comment: "border-left:4px solid #3b82f6;background:#eff6ff;padding:10px 14px;margin:10px 0;white-space:pre-wrap",
  line: "border-top:2px solid #334155;height:2px;margin:18px 0",
  arrow: "font-size:20px;letter-spacing:2px;margin:12px 0;color:#334155",
};

export const JunBlock = Node.create({
  name: "junBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      kind: { default: "textbox" },
      text: { default: "" },
    };
  },
  parseHTML() {
    return [{
      tag: "div[data-jun-block]",
      getAttrs: (element) => {
        const el = element as HTMLElement;
        return {
          kind: el.getAttribute("data-kind") || "textbox",
          text: el.getAttribute("data-text") || el.textContent || "",
        };
      },
    }];
  },
  renderHTML({ node }) {
    const kind = String(node.attrs.kind || "textbox");
    const text = String(node.attrs.text || "");
    if (kind === "line") {
      return ["div", {
        "data-jun-block": "true",
        "data-kind": kind,
        "data-text": "",
        style: BLOCK_STYLE.line,
        "aria-label": "Line",
      }];
    }
    if (kind === "arrow") {
      return ["div", {
        "data-jun-block": "true",
        "data-kind": kind,
        "data-text": text || "────────►",
        style: BLOCK_STYLE.arrow,
        "aria-label": "Arrow",
      }, text || "────────►"];
    }
    return ["div", {
      "data-jun-block": "true",
      "data-kind": kind,
      "data-text": text,
      style: BLOCK_STYLE[kind] || BLOCK_STYLE.textbox,
    }, text];
  },
});

export const JunImage = Node.create({
  name: "junImage",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: "Document image" },
      title: { default: "" },
      width: { default: 640 },
      height: { default: 360 },
    };
  },
  parseHTML() {
    return [{ tag: 'img[data-jun-image="true"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes, {
      "data-jun-image": "true",
      style: "display:block;max-width:100%;height:auto;margin:12px auto;border-radius:4px",
      loading: "lazy",
      referrerpolicy: "no-referrer",
    })];
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    junHighlight: { toggleJunHighlight: () => ReturnType };
    junBlackout: { toggleJunBlackout: () => ReturnType };
  }
}
