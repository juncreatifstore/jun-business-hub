"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { JunBlackout, JunBlock, JunHighlight, JunImage } from "@/lib/document-editor-extensions";
import { JunSmartFields } from "@/lib/document-editor-smart-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Undo2, Redo2, Link as LinkIcon,
  Eraser, CheckCircle2, AlertCircle, RotateCcw, ChevronDown, Plus,
  MoreHorizontal, Highlighter, EyeOff, Strikethrough, Quote,
} from "lucide-react";

function cleanEditorSource(value: string): string {
  let out = String(value ?? "").trim();
  out = out
    .replace(/^\s*```(?:html)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .replace(/^\s*<p>\s*(?:```|&#96;&#96;&#96;)(?:html)?\s*<\/p>\s*/i, "")
    .replace(/\s*<p>\s*(?:```|&#96;&#96;&#96;)\s*<\/p>\s*$/i, "")
    .replace(/^\s*<div>\s*(?:```|&#96;&#96;&#96;)(?:html)?\s*<\/div>\s*/i, "")
    .replace(/\s*<div>\s*(?:```|&#96;&#96;&#96;)\s*<\/div>\s*$/i, "");
  return out.trim();
}

function TBtn({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rounded-md p-2 text-sm transition ${active ? "bg-electric/15 text-electric" : "text-muted2 hover:bg-white/5 hover:text-white"}`}
    >
      {children}
    </button>
  );
}

function Menu({ label, icon, children, wide = false }: { label: string; icon?: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/5 hover:text-white [&::-webkit-details-marker]:hidden">
        {icon}{label}<ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
      </summary>
      <div className={`absolute left-0 top-full z-50 mt-1 max-h-[440px] overflow-auto rounded-lg border border-slate-700 bg-slate-950 p-1.5 shadow-2xl ${wide ? "w-[520px]" : "w-56"}`}>
        {children}
      </div>
    </details>
  );
}

function MenuItem({ label, hint, onClick, icon }: { label: string; hint?: string; onClick: () => void; icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        onClick();
        (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
      }}
      className="flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left text-xs text-slate-200 hover:bg-white/10 hover:text-white"
    >
      {icon ? <span className="mt-0.5 text-slate-400">{icon}</span> : null}
      <span><span className="block font-medium">{label}</span>{hint ? <span className="mt-0.5 block text-[10px] text-slate-500">{hint}</span> : null}</span>
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{children}</div>;
}

type LocalDraft = { content: string; savedAt: string; baseContent: string };

export function DocumentEditor({
  documentId,
  initialContent,
  action,
  readOnly,
}: {
  documentId: string;
  initialContent: string;
  action: (formData: FormData) => Promise<void>;
  readOnly: boolean;
}) {
  const normalizedInitial = useMemo(() => cleanEditorSource(initialContent), [initialContent]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastDraftAt, setLastDraftAt] = useState<Date | null>(null);
  const [recoveredDraft, setRecoveredDraft] = useState<LocalDraft | null>(null);
  const lastServerContent = useRef(normalizedInitial);
  const storageKey = useMemo(() => `jun:document-draft:${documentId}`, [documentId]);

  const editor = useEditor({
    editable: !readOnly,
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"] }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      JunHighlight,
      JunBlackout,
      JunBlock,
      JunImage,
      JunSmartFields,
    ],
    content: normalizedInitial,
    onUpdate: ({ editor }) => {
      setDirty(cleanEditorSource(editor.getHTML()) !== lastServerContent.current);
    },
    editorProps: {
      attributes: { class: "doc-prose min-h-[560px] rounded-b-xl border border-t-0 border-white/10 bg-white px-8 py-7 text-[15px] text-night outline-none" },
    },
  });

  useEffect(() => {
    if (readOnly || !editor) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as LocalDraft;
      const draftContent = cleanEditorSource(draft?.content ?? "");
      if (draftContent && draftContent !== normalizedInitial) setRecoveredDraft({ ...draft, content: draftContent });
    } catch {}
  }, [editor, normalizedInitial, readOnly, storageKey]);

  useEffect(() => {
    if (readOnly || !editor) return;
    const timer = window.setInterval(() => {
      const html = cleanEditorSource(editor.getHTML());
      if (html === lastServerContent.current) return;
      const draft: LocalDraft = { content: html, baseContent: lastServerContent.current, savedAt: new Date().toISOString() };
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(draft));
        setLastDraftAt(new Date(draft.savedAt));
      } catch {}
    }, 2000);
    return () => window.clearInterval(timer);
  }, [editor, readOnly, storageKey]);

  useEffect(() => {
    if (readOnly) return;
    const warn = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, readOnly]);

  async function save(formData: FormData) {
    const html = cleanEditorSource(editor?.getHTML() ?? "");
    formData.set("content", html);
    setSaving(true);
    try {
      try { window.localStorage.removeItem(storageKey); } catch {}
      setDirty(false);
      lastServerContent.current = html;
      await action(formData);
    } finally {
      setSaving(false);
    }
  }

  function restoreLocalDraft() {
    if (!editor || !recoveredDraft) return;
    const content = cleanEditorSource(recoveredDraft.content);
    editor.commands.setContent(content);
    setDirty(content !== lastServerContent.current);
    setLastDraftAt(new Date(recoveredDraft.savedAt));
    setRecoveredDraft(null);
  }

  function discardLocalDraft() {
    try { window.localStorage.removeItem(storageKey); } catch {}
    setRecoveredDraft(null);
  }

  function setLink() {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL (https://…)", prev ?? "https://");
    if (url === null) return;
    if (url === "") editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  function insertText(value: string) {
    editor?.chain().focus().insertContent(value).run();
  }

  function insertToday() {
    const today = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());
    insertText(today);
  }

  function insertBlock(kind: "textbox" | "sticky" | "comment" | "line" | "arrow") {
    if (!editor) return;
    let text = "";
    if (kind === "textbox") {
      const value = window.prompt("Text box content");
      if (value === null || !value.trim()) return;
      text = value.trim();
    } else if (kind === "sticky") {
      const value = window.prompt("Sticky note");
      if (value === null || !value.trim()) return;
      text = value.trim();
    } else if (kind === "comment") {
      const value = window.prompt("Comment");
      if (value === null || !value.trim()) return;
      text = value.trim();
    } else if (kind === "arrow") {
      text = "────────►";
    }
    editor.chain().focus().insertContent({ type: "junBlock", attrs: { kind, text } }).run();
  }

  function insertImage() {
    if (!editor) return;
    const src = window.prompt("Image URL (HTTPS)", "https://");
    if (!src) return;
    let parsed: URL;
    try { parsed = new URL(src); } catch { window.alert("Invalid image URL"); return; }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      window.alert("Only HTTP/HTTPS image URLs are allowed");
      return;
    }
    const alt = window.prompt("Image description", "Document image") ?? "Document image";
    editor.chain().focus().insertContent({
      type: "junImage",
      attrs: { src: parsed.toString(), alt: alt.slice(0, 300), title: alt.slice(0, 300), width: 640, height: 360 },
    }).run();
  }

  function clickLegacyTool(title: string) {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button[title]"));
    const target = buttons.find((button) => button.title === title);
    if (!target) {
      window.alert("This tool is temporarily unavailable. Refresh the editor and try again.");
      return;
    }
    target.click();
  }

  function setTextStyle(value: string) {
    if (!editor) return;
    if (value === "paragraph") editor.chain().focus().setParagraph().run();
    else editor.chain().focus().setHeading({ level: Number(value) as 1 | 2 | 3 }).run();
  }

  if (!editor) return <div className="min-h-[560px] rounded-xl border border-white/10 bg-white/5" />;

  const words = editor.getText().trim() ? editor.getText().trim().split(/\s+/).length : 0;
  const currentStyle = editor.isActive("heading", { level: 1 }) ? "1" : editor.isActive("heading", { level: 2 }) ? "2" : editor.isActive("heading", { level: 3 }) ? "3" : "paragraph";

  const basicFields = [
    ["Text", "Add text fillable field"], ["Number", "Add number fillable field"], ["Date", "Add date fillable field"],
    ["Dropdown", "Add dropdown fillable field"], ["Checkbox", "Add checkbox fillable field"], ["Signature", "Add signature fillable field"],
    ["Initials", "Add initials fillable field"], ["Image", "Add image fillable field"], ["Radio", "Add radio fillable field"], ["Formula", "Add formula fillable field"],
  ] as const;
  const smartFields = [
    ["Name", "Add Name smart field"], ["Email", "Add Email smart field"], ["Company", "Add Company smart field"], ["Title", "Add Title smart field"],
    ["US Phone", "Add US Phone smart field"], ["ZIP", "Add ZIP smart field"], ["USD", "Add USD smart field"], ["EUR", "Add EUR smart field"],
    ["Age", "Add Age smart field"], ["SSN", "Add SSN smart field"], ["EIN", "Add EIN smart field"], ["Card", "Add Card smart field"],
    ["US State", "Add US State smart field"], ["Gender", "Add Gender smart field"],
  ] as const;

  return (
    <form action={save}>
      <style>{`.simple-doc-editor [data-jun-smart-fields], .simple-doc-editor [data-jun-fill-toolbar] { display:none !important; }`}</style>

      {!readOnly && recoveredDraft ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
          <div><p className="font-medium text-amber-900">Unsaved draft recovered</p><p className="text-xs text-amber-700">Autosaved {new Date(recoveredDraft.savedAt).toLocaleString()}.</p></div>
          <div className="flex gap-2"><Button type="button" variant="outline" onClick={discardLocalDraft}>Discard</Button><Button type="button" variant="primary" onClick={restoreLocalDraft}><RotateCcw className="mr-1.5 h-4 w-4" />Restore draft</Button></div>
        </div>
      ) : null}

      <div className="simple-doc-editor">
        {!readOnly ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-xl border border-white/10 bg-night px-3 py-2 text-white">
            <div className="flex flex-wrap items-center gap-0.5">
              <TBtn title="Undo" onClick={() => editor.chain().focus().undo().run()}><Undo2 className="h-4 w-4" /></TBtn>
              <TBtn title="Redo" onClick={() => editor.chain().focus().redo().run()}><Redo2 className="h-4 w-4" /></TBtn>
              <span className="mx-1 h-5 w-px bg-white/10" />

              <select
                aria-label="Text style"
                value={currentStyle}
                onChange={(e) => setTextStyle(e.target.value)}
                className="h-8 rounded-md border border-white/10 bg-white/5 px-2 text-xs text-slate-200 outline-none hover:bg-white/10"
              >
                <option value="paragraph" className="bg-slate-950">Normal</option>
                <option value="1" className="bg-slate-950">Heading 1</option>
                <option value="2" className="bg-slate-950">Heading 2</option>
                <option value="3" className="bg-slate-950">Heading 3</option>
              </select>

              <span className="mx-1 h-5 w-px bg-white/10" />
              <TBtn title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></TBtn>
              <TBtn title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></TBtn>
              <TBtn title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="h-4 w-4" /></TBtn>

              <span className="mx-1 h-5 w-px bg-white/10" />
              <TBtn title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></TBtn>
              <TBtn title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></TBtn>

              <Menu label="Align">
                <MenuItem label="Left" icon={<AlignLeft className="h-4 w-4" />} onClick={() => editor.chain().focus().setTextAlign("left").run()} />
                <MenuItem label="Center" icon={<AlignCenter className="h-4 w-4" />} onClick={() => editor.chain().focus().setTextAlign("center").run()} />
                <MenuItem label="Right" icon={<AlignRight className="h-4 w-4" />} onClick={() => editor.chain().focus().setTextAlign("right").run()} />
              </Menu>

              <TBtn title="Link" active={editor.isActive("link")} onClick={setLink}><LinkIcon className="h-4 w-4" /></TBtn>
              <span className="mx-1 h-5 w-px bg-white/10" />

              <Menu label="Insert" icon={<Plus className="h-4 w-4" />} wide>
                <div className="grid grid-cols-2 gap-x-1">
                  <div>
                    <SectionLabel>Document</SectionLabel>
                    <MenuItem label="Date today" onClick={insertToday} />
                    <MenuItem label="Image" onClick={insertImage} />
                    <MenuItem label="Horizontal line" onClick={() => editor.chain().focus().setHorizontalRule().run()} />
                    <MenuItem label="Checkmark ✓" onClick={() => insertText("✓")} />
                    <MenuItem label="Text box" onClick={() => insertBlock("textbox")} />
                    <MenuItem label="Drawing" onClick={() => clickLegacyTool("Freehand drawing")} />
                    <SectionLabel>Fillable fields</SectionLabel>
                    {basicFields.map(([label, title]) => <MenuItem key={title} label={label} onClick={() => clickLegacyTool(title)} />)}
                  </div>
                  <div>
                    <SectionLabel>Smart fields</SectionLabel>
                    {smartFields.map(([label, title]) => <MenuItem key={title} label={label} onClick={() => clickLegacyTool(title)} />)}
                  </div>
                </div>
              </Menu>

              <Menu label="Variables">
                <MenuItem label="Company profile" hint="Name, address, phone, EIN and other Settings values" onClick={() => clickLegacyTool("Insert company information from Settings")} />
              </Menu>

              <Menu label="More" icon={<MoreHorizontal className="h-4 w-4" />}>
                <MenuItem label="Strikethrough" icon={<Strikethrough className="h-4 w-4" />} onClick={() => editor.chain().focus().toggleStrike().run()} />
                <MenuItem label="Highlight" icon={<Highlighter className="h-4 w-4" />} onClick={() => editor.chain().focus().toggleJunHighlight().run()} />
                <MenuItem label="Redact / blackout" icon={<EyeOff className="h-4 w-4" />} onClick={() => editor.chain().focus().toggleJunBlackout().run()} />
                <MenuItem label="Blockquote" icon={<Quote className="h-4 w-4" />} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
                <MenuItem label="Sticky note" onClick={() => insertBlock("sticky")} />
                <MenuItem label="Comment" onClick={() => insertBlock("comment")} />
                <MenuItem label="Arrow" onClick={() => insertBlock("arrow")} />
                <MenuItem label="Field order" hint="Reorder form fields and tab sequence" onClick={() => clickLegacyTool("Reorder Wizard / Tab sequence")} />
                <MenuItem label="Clear formatting" icon={<Eraser className="h-4 w-4" />} onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} />
              </Menu>
            </div>

            <div className="flex items-center gap-3 px-1 text-[11px]">
              <span className="text-white/45">{words} words</span>
              {dirty ? <span className="inline-flex items-center gap-1 text-amber-300"><AlertCircle className="h-3.5 w-3.5" />Unsaved</span> : <span className="inline-flex items-center gap-1 text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />Saved</span>}
            </div>
          </div>
        ) : null}

        <EditorContent editor={editor} />
      </div>

      {!readOnly ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <Input name="changeNote" placeholder="Change note (what changed in this version?)" maxLength={300} />
            <p className="mt-1 text-xs text-muted2">{dirty && lastDraftAt ? `Local autosave: ${lastDraftAt.toLocaleTimeString()}` : "Official history changes only when you save a new version."}</p>
          </div>
          <Button type="submit" variant="primary" disabled={saving || !dirty}>{saving ? "Saving…" : dirty ? "Save new version" : "Saved"}</Button>
        </div>
      ) : null}
    </form>
  );
}
