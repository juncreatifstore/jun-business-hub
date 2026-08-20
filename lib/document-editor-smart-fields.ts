import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC","PR","VI","GU","AS","MP",
].join(",");

const SMART_FIELDS = [
  { type: "NAME", label: "Name", validation: "name", help: "Full legal name" },
  { type: "EMAIL", label: "Email", validation: "email", help: "Valid email address" },
  { type: "COMPANY", label: "Company", validation: "company", help: "Legal company name" },
  { type: "TITLE", label: "Title", validation: "title", help: "Job title / position" },
  { type: "US_PHONE", label: "US Phone", validation: "us_phone", help: "(XXX) XXX-XXXX" },
  { type: "ZIP", label: "ZIP", validation: "us_zip", help: "5 digits or ZIP+4" },
  { type: "US_CURRENCY", label: "USD", validation: "us_currency", help: "US currency amount" },
  { type: "EU_CURRENCY", label: "EUR", validation: "eu_currency", help: "EU currency amount" },
  { type: "AGE", label: "Age", validation: "age", help: "Whole number" },
  { type: "SSN", label: "SSN", validation: "ssn", help: "XXX-XX-XXXX" },
  { type: "EIN", label: "EIN", validation: "ein", help: "XX-XXXXXXX" },
  { type: "CREDIT_CARD", label: "Card", validation: "credit_card", help: "15–16 digit card number" },
  { type: "US_STATE", label: "US State", validation: "us_state", help: "US state or territory", options: US_STATES },
  { type: "GENDER", label: "Gender", validation: "gender", help: "Select an option", options: "Female,Male,Non-binary,Prefer not to say,Other" },
] as const;

function collectFields(view: EditorView) {
  const fields: Array<{ pos: number; attrs: Record<string, unknown> }> = [];
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === "junBlock" && node.attrs.kind === "field") fields.push({ pos, attrs: { ...node.attrs } });
  });
  return fields.sort((a, b) => Number(a.attrs.order || 0) - Number(b.attrs.order || 0));
}

function insertSmartField(view: EditorView, preset: typeof SMART_FIELDS[number]) {
  const defaultName = preset.type.toLowerCase();
  const name = window.prompt(`${preset.label} field name`, defaultName);
  if (!name?.trim()) return;
  const required = window.confirm("Is this field required?");
  const fields = collectFields(view);
  const node = view.state.schema.nodes.junBlock?.create({
    kind: "field",
    text: "",
    fieldType: preset.type,
    fieldName: name.trim().slice(0, 120),
    required,
    help: preset.help,
    options: "options" in preset ? preset.options : "",
    order: fields.length + 1,
    validation: preset.validation,
    formula: "",
  });
  if (!node) return;
  view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
  view.focus();
}

function button(label: string, title: string, click: () => void) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.title = title;
  b.style.cssText = "border:1px solid #475569;background:#1e293b;color:#e2e8f0;border-radius:6px;padding:5px 8px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap";
  b.addEventListener("mousedown", (e) => e.preventDefault());
  b.addEventListener("click", click);
  return b;
}

function openFieldOrder(view: EditorView) {
  const source = collectFields(view);
  if (!source.length) { window.alert("No fillable fields in this document."); return; }
  const items = source.map((field) => ({ ...field }));
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.72);display:flex;align-items:center;justify-content:center;padding:20px";
  const card = document.createElement("div");
  card.style.cssText = "width:min(720px,96vw);max-height:85vh;overflow:auto;background:#fff;border-radius:14px;padding:18px;box-shadow:0 24px 70px rgba(0,0,0,.35);font-family:system-ui,sans-serif";
  const heading = document.createElement("div");
  heading.innerHTML = '<div style="font-weight:750;color:#0f172a">Field order</div><div style="font-size:12px;color:#64748b;margin-top:3px">This order controls Preview / Fill wizard and keyboard navigation.</div>';
  const list = document.createElement("div");
  list.style.cssText = "display:grid;gap:7px;margin:14px 0";

  const render = () => {
    list.innerHTML = "";
    items.forEach((item, index) => {
      const row = document.createElement("div");
      row.style.cssText = "display:grid;grid-template-columns:36px 1fr auto;align-items:center;gap:8px;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px";
      const n = document.createElement("strong"); n.textContent = String(index + 1); n.style.color = "#2563eb";
      const label = document.createElement("div");
      label.innerHTML = `<div style="font-size:13px;font-weight:650;color:#0f172a"></div><div style="font-size:11px;color:#64748b"></div>`;
      (label.children[0] as HTMLElement).textContent = String(item.attrs.fieldName || "Field");
      (label.children[1] as HTMLElement).textContent = String(item.attrs.fieldType || "TEXT");
      const actions = document.createElement("div"); actions.style.cssText = "display:flex;gap:5px";
      const up = button("↑", "Move up", () => { if (index <= 0) return; [items[index - 1], items[index]] = [items[index], items[index - 1]]; render(); });
      const down = button("↓", "Move down", () => { if (index >= items.length - 1) return; [items[index + 1], items[index]] = [items[index], items[index + 1]]; render(); });
      up.disabled = index === 0; down.disabled = index === items.length - 1;
      actions.append(up, down); row.append(n, label, actions); list.append(row);
    });
  };
  render();

  const footer = document.createElement("div"); footer.style.cssText = "display:flex;justify-content:flex-end;gap:8px";
  const cancel = button("Cancel", "Close without changes", () => { overlay.remove(); view.focus(); });
  const save = button("Save order", "Apply field order", () => {
    let tr = view.state.tr;
    items.forEach((item, index) => { tr = tr.setNodeMarkup(item.pos, undefined, { ...item.attrs, order: index + 1 }); });
    view.dispatch(tr.scrollIntoView()); overlay.remove(); view.focus();
  });
  save.style.background = "#2563eb"; save.style.color = "white"; save.style.borderColor = "#2563eb";
  footer.append(cancel, save); card.append(heading, list, footer); overlay.append(card); document.body.append(overlay);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) cancel.click(); });
}

function buildToolbar(view: EditorView) {
  const bar = document.createElement("div");
  bar.setAttribute("data-jun-smart-fields", "true");
  bar.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:5px;padding:8px 10px;background:#0b1220;border-left:1px solid #334155;border-right:1px solid #334155;border-bottom:1px solid #334155;color:white";
  const label = document.createElement("span"); label.textContent = "Smart fields"; label.style.cssText = "font-size:11px;font-weight:700;color:#94a3b8;margin-right:4px"; bar.append(label);
  SMART_FIELDS.forEach((preset) => bar.append(button(preset.label, `Add ${preset.label} smart field`, () => insertSmartField(view, preset))));
  const sep = document.createElement("span"); sep.style.cssText = "width:1px;height:22px;background:#334155;margin:0 3px"; bar.append(sep);
  bar.append(button("Field order", "Reorder Wizard / Tab sequence", () => openFieldOrder(view)));
  return bar;
}

export const JunSmartFields = Extension.create({
  name: "junSmartFields",
  addProseMirrorPlugins() {
    return [new Plugin({
      view: (view) => {
        if (!view.editable) return { destroy() {} };
        const toolbar = buildToolbar(view);
        const parent = view.dom.parentElement;
        if (parent) parent.insertBefore(toolbar, view.dom);
        return { destroy() { toolbar.remove(); } };
      },
    })];
  },
});
