"use client";
// Production rich-text editor built on Tiptap. Same public API as the previous
// contentEditable version: { initialContent, action, readOnly }.
// Content is ALSO sanitized server-side on save — the editor is UX, not security.
import { useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered,
  Quote, Heading1, Heading2, Heading3, AlignLeft, AlignCenter, AlignRight,
  Undo2, Redo2, Link as LinkIcon, Minus,
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

export function DocumentEditor({
  initialContent,
  action,
  readOnly,
}: {
  initialContent: string;
  action: (formData: FormData) => Promise<void>;
  readOnly: boolean;
}) {
  const [saving, setSaving] = useState(false);

  const editor = useEditor({
    editable: !readOnly,
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"] }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: initialContent,
    editorProps: {
      attributes: { class: "doc-prose min-h-[420px] rounded-b-xl border border-t-0 border-white/10 bg-white px-6 py-5 text-[15px] text-night outline-none" },
    },
  });

  async function save(formData: FormData) {
    formData.set("content", editor?.getHTML() ?? "");
    setSaving(true);
    try {
      await action(formData);
    } finally {
      setSaving(false);
    }
  }

  function setLink() {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL (https://…)", prev ?? "https://");
    if (url === null) return;
    if (url === "") editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  if (!editor) return <div className="min-h-[420px] rounded-xl border border-white/10 bg-white/5" />;

  return (
    <form action={save}>
      {!readOnly ? (
        <div className="flex flex-wrap items-center gap-0.5 rounded-t-xl border border-white/10 bg-white/[0.04] px-2 py-1">
          <TBtn title="Heading 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 className="h-4 w-4" /></TBtn>
          <TBtn title="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></TBtn>
          <TBtn title="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 className="h-4 w-4" /></TBtn>
          <span className="mx-1 h-5 w-px bg-white/10" />
          <TBtn title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></TBtn>
          <TBtn title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></TBtn>
          <TBtn title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="h-4 w-4" /></TBtn>
          <TBtn title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></TBtn>
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
          <span className="mx-1 h-5 w-px bg-white/10" />
          <TBtn title="Undo" onClick={() => editor.chain().focus().undo().run()}><Undo2 className="h-4 w-4" /></TBtn>
          <TBtn title="Redo" onClick={() => editor.chain().focus().redo().run()}><Redo2 className="h-4 w-4" /></TBtn>
        </div>
      ) : null}

      <EditorContent editor={editor} />

      {!readOnly ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <Input name="changeNote" placeholder="Change note (what changed in this version?)" maxLength={300} />
          </div>
          <Button type="submit" variant="primary" disabled={saving}>{saving ? "Saving…" : "Save new version"}</Button>
        </div>
      ) : null}
    </form>
  );
}
