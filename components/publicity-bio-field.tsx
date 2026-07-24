"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeRichTextLinkUrl, sanitizeRichText, stripRichTextToPlain } from "@/lib/rich-text";

type Props = {
  name: string;
  initialValue: string;
  previewName: string;
  previewRole?: string;
  label: string;
  characterLimit?: number;
  compact?: boolean;
};

export function PublicityBioField({ name, initialValue, previewName, previewRole, label, characterLimit, compact = false }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<Range | null>(null);
  const [value, setValue] = useState(() => sanitizeRichText(initialValue));
  const plainLength = useMemo(() => stripRichTextToPlain(value).length, [value]);
  const overLimit = characterLimit ? plainLength > characterLimit : false;

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) editorRef.current.innerHTML = value;
  }, [value]);

  function rememberSelection() {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !editorRef.current) return;
    const range = selection.getRangeAt(0);
    if (editorRef.current.contains(range.commonAncestorContainer)) selectionRef.current = range.cloneRange();
  }

  function restoreSelection() {
    if (!selectionRef.current) return;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(selectionRef.current);
  }

  function run(command: string, argument?: string) {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand(command, false, argument);
    rememberSelection();
    if (editorRef.current) setValue(sanitizeRichText(editorRef.current.innerHTML));
  }

  return <div className={`publicity-rich-layout${compact ? " compact" : ""}`}>
    <div>
      <div className="publicity-bio-guidance">
        <strong>{label}</strong>
        <span>Write only the biography itself. Do not include your name or role—the program adds both automatically.</span>
      </div>
      <div className="rich-toolbar" role="toolbar" aria-label={`${label} formatting`}
        onMouseDown={(event) => {
          if ((event.target as HTMLElement).closest("button")) event.preventDefault();
        }}>
        <button type="button" className="rich-tool-button" onClick={() => run("bold")}><strong>B</strong></button>
        <button type="button" className="rich-tool-button" onClick={() => run("italic")}><em>I</em></button>
        <button type="button" className="rich-tool-button" onClick={() => run("underline")}><u>U</u></button>
        <button type="button" className="rich-tool-button" onClick={() => run("insertUnorderedList")}>Bullets</button>
        <button type="button" className="rich-tool-button" onClick={() => run("insertOrderedList")}>Numbered</button>
        <button type="button" className="rich-tool-button" onClick={() => {
          if (!selectionRef.current || selectionRef.current.collapsed) {
            window.alert("Select the words you want to turn into a link first.");
            return;
          }
          const enteredUrl = window.prompt("Link URL or email address");
          if (!enteredUrl?.trim()) return;
          const url = normalizeRichTextLinkUrl(enteredUrl);
          if (!url) {
            window.alert("Enter a complete web address or email address.");
            return;
          }
          run("createLink", url);
        }}>Link</button>
        <button type="button" className="rich-tool-button" onClick={() => run("unlink")}>Unlink</button>
        <button type="button" className="rich-tool-button" onClick={() => run("removeFormat")}>Clear</button>
        <button type="button" className="rich-tool-button" onClick={() => run("undo")}>Undo</button>
        <button type="button" className="rich-tool-button" onClick={() => run("redo")}>Redo</button>
      </div>
      <div ref={editorRef} className="rich-editor" contentEditable suppressContentEditableWarning data-placeholder="Write your bio here…"
        onInput={() => {
          rememberSelection();
          if (editorRef.current) setValue(editorRef.current.innerHTML);
        }}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        onBlur={() => setValue((current) => sanitizeRichText(current))} />
      {characterLimit ? <p className={overLimit ? "rich-counter over" : "rich-counter"}>{plainLength} / {characterLimit} visible characters</p> : null}
      <textarea className="sr-only" aria-hidden name={name} value={value} onChange={() => {}} />
    </div>
    <aside className="publicity-bio-preview">
      <p className="eyebrow">Live Playbill Preview</p>
      <h3>{previewName}</h3>
      {previewRole ? <p className="preview-role">{previewRole}</p> : null}
      <div className="rich-render bio-body" dangerouslySetInnerHTML={{ __html: sanitizeRichText(value) }} />
    </aside>
  </div>;
}

export function PublicityBioPreview({ bio, name, role }: { bio: string; name: string; role?: string }) {
  return <div className="publicity-bio-preview static">
    <h3>{name}</h3>{role ? <p className="preview-role">{role}</p> : null}
    <div className="rich-render bio-body" dangerouslySetInnerHTML={{ __html: sanitizeRichText(bio) }} />
  </div>;
}
