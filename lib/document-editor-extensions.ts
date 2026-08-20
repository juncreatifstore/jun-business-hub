import { Mark, Node, mergeAttributes, type CommandProps } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

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
      toggleJunHighlight: () => ({ commands }: CommandProps) => commands.toggleMark(this.name),
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
      toggleJunBlackout: () => ({ commands }: CommandProps) => commands.toggleMark(this.name),
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

const FIELD_TYPES = ["TEXT", "NUMBER", "DATE", "DROPDOWN", "CHECKBOX", "SIGNATURE", "INITIALS", "IMAGE", "FORMULA", "RADIO"] as const;
type FieldType = typeof FIELD_TYPES[number];

function countFields(view: EditorView): number {
  let count = 0;
  view.state.doc.descendants((node) => {
    if (node.type.name === "junBlock" && node.attrs.kind === "field") count += 1;
  });
  return count;
}

function insertField(view: EditorView, fieldType: FieldType) {
  const name = window.prompt(`${fieldType} field name`, fieldType.toLowerCase());
  if (!name?.trim()) return;
  const required = window.confirm("Is this field required?");
  const help = window.prompt("Help / hint text (optional)", "") ?? "";
  let options = "";
  let validation = "";
  let formula = "";
  if (fieldType === "DROPDOWN" || fieldType === "RADIO") {
    options = window.prompt("Options separated by commas", "Option 1, Option 2") ?? "";
  }
  if (fieldType === "TEXT" || fieldType === "NUMBER" || fieldType === "DATE") {
    validation = window.prompt("Validation rule (optional: email, phone, min/max, date range…)", "") ?? "";
  }
  if (fieldType === "FORMULA") {
    formula = window.prompt("Formula (example: price * quantity)", "") ?? "";
  }
  const order = countFields(view) + 1;
  const node = view.state.schema.nodes.junBlock?.create({
    kind: "field",
    text: "",
    fieldType,
    fieldName: name.trim().slice(0, 120),
    required,
    help: help.slice(0, 300),
    options: options.slice(0, 1000),
    order,
    validation: validation.slice(0, 300),
    formula: formula.slice(0, 500),
  });
  if (!node) return;
  view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
  view.focus();
}

function openDrawPad(view: EditorView) {
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.72);display:flex;align-items:center;justify-content:center;padding:20px";
  const card = document.createElement("div");
  card.style.cssText = "width:min(760px,96vw);background:#fff;border-radius:14px;padding:18px;box-shadow:0 24px 70px rgba(0,0,0,.35);font-family:system-ui,sans-serif";
  const title = document.createElement("div");
  title.textContent = "Draw on document";
  title.style.cssText = "font-weight:700;color:#0f172a;margin-bottom:10px";
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 360;
  canvas.style.cssText = "width:100%;height:210px;border:1px solid #cbd5e1;border-radius:8px;background:white;touch-action:none;display:block";
  const row = document.createElement("div");
  row.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:12px";
  const makeButton = (label: string, primary = false) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText = primary
      ? "border:0;border-radius:8px;background:#0f172a;color:#fff;padding:9px 14px;font-weight:600;cursor:pointer"
      : "border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#334155;padding:9px 14px;font-weight:600;cursor:pointer";
    return b;
  };
  const clear = makeButton("Clear");
  const cancel = makeButton("Cancel");
  const insert = makeButton("Insert drawing", true);
  row.append(clear, cancel, insert);
  card.append(title, canvas, row);
  overlay.append(card);
  document.body.append(overlay);

  const ctx = canvas.getContext("2d");
  if (!ctx) { overlay.remove(); return; }
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#111827";
  let drawing = false;
  let hasInk = false;
  const point = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) };
  };
  canvas.addEventListener("pointerdown", (e) => {
    drawing = true;
    hasInk = true;
    canvas.setPointerCapture(e.pointerId);
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  });
  const stop = () => { drawing = false; };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
  clear.onclick = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); hasInk = false; };
  cancel.onclick = () => { overlay.remove(); view.focus(); };
  overlay.addEventListener("click", (e) => { if (e.target === overlay) cancel.click(); });
  insert.onclick = () => {
    if (!hasInk) { window.alert("Draw something before inserting."); return; }
    const src = canvas.toDataURL("image/png");
    if (src.length > 700_000) { window.alert("Drawing is too large. Clear it and use fewer strokes."); return; }
    const node = view.state.schema.nodes.junImage?.create({
      src,
      alt: "Hand drawing",
      title: "Drawn annotation",
      width: 640,
      height: 180,
    });
    if (node) view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
    overlay.remove();
    view.focus();
  };
}

function createEditorToolButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.title = title;
  button.style.cssText = "border:1px solid #334155;background:#0f172a;color:#e2e8f0;border-radius:6px;padding:5px 8px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap";
  button.addEventListener("mousedown", (e) => e.preventDefault());
  button.addEventListener("click", onClick);
  return button;
}

function buildFillToolbar(view: EditorView): HTMLElement {
  const bar = document.createElement("div");
  bar.setAttribute("data-jun-fill-toolbar", "true");
  bar.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:5px;padding:8px 10px;background:#111827;border-left:1px solid #334155;border-right:1px solid #334155;border-bottom:1px solid #334155;color:white";
  const label = document.createElement("span");
  label.textContent = "Fill & annotate";
  label.style.cssText = "font-size:11px;font-weight:700;color:#94a3b8;margin-right:4px";
  bar.append(label);
  bar.append(createEditorToolButton("Draw", "Freehand drawing", () => openDrawPad(view)));
  for (const fieldType of FIELD_TYPES) {
    const short = fieldType === "SIGNATURE" ? "Signature" : fieldType === "INITIALS" ? "Initials" : fieldType.charAt(0) + fieldType.slice(1).toLowerCase();
    bar.append(createEditorToolButton(short, `Add ${fieldType.toLowerCase()} fillable field`, () => insertField(view, fieldType)));
  }
  return bar;
}

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
      fieldType: { default: "TEXT" },
      fieldName: { default: "" },
      required: { default: false },
      help: { default: "" },
      options: { default: "" },
      order: { default: 0 },
      validation: { default: "" },
      formula: { default: "" },
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
          fieldType: el.getAttribute("data-field-type") || "TEXT",
          fieldName: el.getAttribute("data-field-name") || "",
          required: el.getAttribute("data-required") === "true",
          help: el.getAttribute("data-help") || "",
          options: el.getAttribute("data-options") || "",
          order: Number(el.getAttribute("data-order") || 0),
          validation: el.getAttribute("data-validation") || "",
          formula: el.getAttribute("data-formula") || "",
        };
      },
    }];
  },
  renderHTML({ node }) {
    const kind = String(node.attrs.kind || "textbox");
    const text = String(node.attrs.text || "");
    if (kind === "field") {
      const type = String(node.attrs.fieldType || "TEXT").toUpperCase();
      const name = String(node.attrs.fieldName || "Field");
      const required = Boolean(node.attrs.required);
      const help = String(node.attrs.help || "");
      const options = String(node.attrs.options || "");
      const order = Number(node.attrs.order || 0);
      const validation = String(node.attrs.validation || "");
      const formula = String(node.attrs.formula || "");
      const display = `#${order || "–"}  ${name}  ·  ${type}${required ? "  * REQUIRED" : ""}${options ? `  ·  ${options}` : ""}${formula ? `  ·  = ${formula}` : ""}${help ? `  ·  ${help}` : ""}`;
      return ["div", {
        "data-jun-block": "true",
        "data-kind": "field",
        "data-text": "",
        "data-jun-field": "true",
        "data-field-type": type,
        "data-field-name": name,
        "data-required": required ? "true" : "false",
        "data-help": help,
        "data-options": options,
        "data-order": String(order),
        "data-validation": validation,
        "data-formula": formula,
        style: "border:1.5px dashed #2563eb;background:#eff6ff;color:#1e3a8a;padding:10px 12px;border-radius:6px;margin:10px 0;font-family:system-ui,sans-serif;font-size:12px;font-weight:600",
      }, display];
    }
    if (kind === "line") {
      return ["div", {
        "data-jun-block": "true", "data-kind": kind, "data-text": "", style: BLOCK_STYLE.line, "aria-label": "Line",
      }];
    }
    if (kind === "arrow") {
      return ["div", {
        "data-jun-block": "true", "data-kind": kind, "data-text": text || "────────►", style: BLOCK_STYLE.arrow, "aria-label": "Arrow",
      }, text || "────────►"];
    }
    return ["div", {
      "data-jun-block": "true", "data-kind": kind, "data-text": text, style: BLOCK_STYLE[kind] || BLOCK_STYLE.textbox,
    }, text];
  },
  addProseMirrorPlugins() {
    return [new Plugin({
      view: (view) => {
        if (!view.editable) return { destroy() {} };
        const toolbar = buildFillToolbar(view);
        const parent = view.dom.parentElement;
        if (parent) parent.insertBefore(toolbar, view.dom);
        return { destroy() { toolbar.remove(); } };
      },
    })];
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
    const isDraw = typeof HTMLAttributes.src === "string" && HTMLAttributes.src.startsWith("data:image/png;base64,");
    return ["img", mergeAttributes(HTMLAttributes, {
      "data-jun-image": "true",
      ...(isDraw ? { "data-jun-draw": "true" } : {}),
      style: `display:block;max-width:100%;height:auto;margin:12px auto;border-radius:4px${isDraw ? ";border:1px dashed #cbd5e1;padding:4px" : ""}`,
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
