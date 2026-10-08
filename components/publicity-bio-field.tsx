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
  draftKey?: string;
  clearDraftWhenSuccessIncludes?: string;
};

export function PublicityBioField({ name, initialValue, previewName, previewRole, label, characterLimit, compact = false, draftKey, clearDraftWhenSuccessIncludes }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<Range | null>(null);
  const skipInitialDraftWrite = useRef(true);
  const [value, setValue] = useState(() => sanitizeRichText(initialValue));
  const [restoredDraft, setRestoredDraft] = useState(false);
  const plainLength = useMemo(() => stripRichTextToPlain(value).length, [value]);
  const overLimit = characterLimit ? plainLength > characterLimit : false;
  const nearLimit = characterLimit ? plainLength >= Math.floor(characterLimit * 0.85) : false;

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) editorRef.current.innerHTML = value;
  }, [value]);

  useEffect(() => {
    if (!draftKey) return;
    const success = new URLSearchParams(window.location.search).get("success") ?? "";
    if (clearDraftWhenSuccessIncludes && success.includes(clearDraftWhenSuccessIncludes)) {
      window.sessionStorage.removeItem(draftKey);
      return;
    }
    const saved = window.sessionStorage.getItem(draftKey);
    if (saved !== null && saved !== initialValue) {
      setValue(sanitizeRichText(saved));
      setRestoredDraft(true);
    }
  }, [clearDraftWhenSuccessIncludes, draftKey, initialValue]);

  useEffect(() => {
    if (!draftKey) return;
    if (skipInitialDraftWrite.current) {
      skipInitialDraftWrite.current = false;
      return;
    }
    window.sessionStorage.setItem(draftKey, value);
  }, [draftKey, value]);

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
        <div className="publicity-bio-heading">
          <strong>{label}</strong>
          {characterLimit ? <span className="publicity-bio-limit">Maximum: {characterLimit} visible characters</span> : null}
        </div>
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
      {characterLimit ? <p className={`rich-counter${overLimit ? " over" : nearLimit ? " near" : ""}`} role={overLimit ? "alert" : "status"} aria-live="polite">
        {overLimit
          ? `${plainLength} of ${characterLimit} visible characters used — ${plainLength - characterLimit} over the limit. Shorten the bio before saving.`
          : `${plainLength} of ${characterLimit} visible characters used · ${characterLimit - plainLength} remaining`}
      </p> : null}
      <textarea className="sr-only" aria-hidden name={name} value={value} onChange={() => {}} />
      {restoredDraft ? <p className="setup-success" role="status">Your unsaved bio draft was restored in this browser session.</p> : null}
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
