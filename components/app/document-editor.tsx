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
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered,
  Quote, Heading1, Heading2, Heading3, AlignLeft, AlignCenter, AlignRight,
  Undo2, Redo2, Link as LinkIcon, Minus, Pilcrow, Eraser, CheckCircle2,
  AlertCircle, RotateCcw, CalendarDays, Check, X, Circle, Image as ImageIcon,
  Highlighter, EyeOff, Square, StickyNote, MessageSquare, ArrowRight,
} from "lucide-react";

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
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastDraftAt, setLastDraftAt] = useState<Date | null>(null);
  const [recoveredDraft, setRecoveredDraft] = useState<LocalDraft | null>(null);
  const lastServerContent = useRef(initialContent);
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
    content: initialContent,
    onUpdate: ({ editor }) => {
      setDirty(editor.getHTML() !== lastServerContent.current);
    },
    editorProps: {
      attributes: { class: "doc-prose min-h-[520px] rounded-b-xl border border-t-0 border-white/10 bg-white px-6 py-5 text-[15px] text-night outline-none" },
    },
  });

  useEffect(() => {
    if (readOnly || !editor) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as LocalDraft;
      if (draft?.content && draft.content !== initialContent) setRecoveredDraft(draft);
    } catch {}
  }, [editor, initialContent, readOnly, storageKey]);

  useEffect(() => {
    if (readOnly || !editor) return;
    const timer = window.setInterval(() => {
      const html = editor.getHTML();
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
    const html = editor?.getHTML() ?? "";
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
    editor.commands.setContent(recoveredDraft.content);
    setDirty(true);
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

  if (!editor) return <div className="min-h-[520px] rounded-xl border border-white/10 bg-white/5" />;

  const words = editor.getText().trim() ? editor.getText().trim().split(/\s+/).length : 0;

  return (
    <form action={save}>
      {!readOnly && recoveredDraft ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
          <div><p className="font-medium text-amber-900">Unsaved draft recovered</p><p className="text-xs text-amber-700">Autosaved {new Date(recoveredDraft.savedAt).toLocaleString()}.</p></div>
          <div className="flex gap-2"><Button type="button" variant="outline" onClick={discardLocalDraft}>Discard</Button><Button type="button" variant="primary" onClick={restoreLocalDraft}><RotateCcw className="mr-1.5 h-4 w-4" />Restore draft</Button></div>
        </div>
      ) : null}

      {!readOnly ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-xl border border-white/10 bg-night px-3 py-2 text-white">
            <div className="flex flex-wrap items-center gap-0.5">
              <TBtn title="Paragraph" active={editor.isActive("paragraph")} onClick={() => editor.chain().focus().setParagraph().run()}><Pilcrow className="h-4 w-4" /></TBtn>
              <TBtn title="Heading 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 className="h-4 w-4" /></TBtn>
              <TBtn title="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></TBtn>
              <TBtn title="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 className="h-4 w-4" /></TBtn>
              <span className="mx-1 h-5 w-px bg-white/10" />
              <TBtn title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></TBtn>
              <TBtn title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></TBtn>
              <TBtn title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="h-4 w-4" /></TBtn>
              <TBtn title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></TBtn>
              <TBtn title="Highlight selection" active={editor.isActive("junHighlight")} onClick={() => editor.chain().focus().toggleJunHighlight().run()}><Highlighter className="h-4 w-4" /></TBtn>
              <TBtn title="Blackout / redact selection" active={editor.isActive("junBlackout")} onClick={() => editor.chain().focus().toggleJunBlackout().run()}><EyeOff className="h-4 w-4" /></TBtn>
              <span className="mx-1 h-5 w-px bg-white/10" />
              <TBtn title="Insert date" onClick={insertToday}><CalendarDays className="h-4 w-4" /></TBtn>
              <TBtn title="Insert checkmark" onClick={() => insertText("✓")}><Check className="h-4 w-4" /></TBtn>
              <TBtn title="Insert crossmark" onClick={() => insertText("✕")}><X className="h-4 w-4" /></TBtn>
              <TBtn title="Insert circle" onClick={() => insertText("○")}><Circle className="h-4 w-4" /></TBtn>
              <TBtn title="Insert image" onClick={insertImage}><ImageIcon className="h-4 w-4" /></TBtn>
              <TBtn title="Text box" onClick={() => insertBlock("textbox")}><Square className="h-4 w-4" /></TBtn>
              <TBtn title="Sticky note" onClick={() => insertBlock("sticky")}><StickyNote className="h-4 w-4" /></TBtn>
              <TBtn title="Comment" onClick={() => insertBlock("comment")}><MessageSquare className="h-4 w-4" /></TBtn>
              <TBtn title="Line" onClick={() => insertBlock("line")}><Minus className="h-4 w-4" /></TBtn>
              <TBtn title="Arrow" onClick={() => insertBlock("arrow")}><ArrowRight className="h-4 w-4" /></TBtn>
              <span className="mx-1 h-5 w-px bg-white/10" />
              <TBtn title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></TBtn>
              <TBtn title="Ordered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></TBtn>
              <TBtn title="Blockquote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="h-4 w-4" /></TBtn>
              <TBtn title="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus className="h-4 w-4" /></TBtn>
              <span className="mx-1 h-5 w-px bg-white/10" />
              <TBtn title="Align left" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}><AlignLeft className="h-4 w-4" /></TBtn>
              <TBtn title="Align center" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}><AlignCenter className="h-4 w-4" /></TBtn>
              <TBtn title="Align right" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}><AlignRight className="h-4 w-4" /></TBtn>
              <span className="mx-1 h-5 w-px bg-white/10" />
              <TBtn title="Link" active={editor.isActive("link")} onClick={setLink}><LinkIcon className="h-4 w-4" /></TBtn>
              <TBtn title="Clear formatting" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}><Eraser className="h-4 w-4" /></TBtn>
              <span className="mx-1 h-5 w-px bg-white/10" />
              <TBtn title="Undo" onClick={() => editor.chain().focus().undo().run()}><Undo2 className="h-4 w-4" /></TBtn>
              <TBtn title="Redo" onClick={() => editor.chain().focus().redo().run()}><Redo2 className="h-4 w-4" /></TBtn>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-white/60">{words} words</span>
              {dirty ? <span className="inline-flex items-center gap-1 text-amber-300"><AlertCircle className="h-3.5 w-3.5" />Unsaved</span> : <span className="inline-flex items-center gap-1 text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />Saved</span>}
            </div>
          </div>
        </>
      ) : null}

      <EditorContent editor={editor} />

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
