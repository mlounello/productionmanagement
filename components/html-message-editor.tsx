"use client";

import { useEffect, useRef, useState } from "react";
import { sanitizeRichText } from "@/lib/rich-text";

export function HtmlMessageEditor({ name, initialValue, label = "Message" }: { name: string; initialValue: string; label?: string }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(() => sanitizeRichText(initialValue));
  useEffect(() => { if (editorRef.current && editorRef.current.innerHTML !== value) editorRef.current.innerHTML = value; }, [value]);
  function run(command: string, argument?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, argument);
    if (editorRef.current) setValue(editorRef.current.innerHTML);
  }
  return <div className="field">
    <span>{label}</span>
    <div className="rich-toolbar" role="toolbar" aria-label={`${label} formatting`}>
      <button type="button" className="rich-tool-button" onClick={() => run("bold")}><strong>B</strong></button>
      <button type="button" className="rich-tool-button" onClick={() => run("italic")}><em>I</em></button>
      <button type="button" className="rich-tool-button" onClick={() => run("underline")}><u>U</u></button>
      <button type="button" className="rich-tool-button" onClick={() => run("formatBlock", "h3")}>Heading</button>
      <button type="button" className="rich-tool-button" onClick={() => run("insertUnorderedList")}>Bullets</button>
      <button type="button" className="rich-tool-button" onClick={() => run("insertOrderedList")}>Numbered</button>
      <button type="button" className="rich-tool-button" onClick={() => { const url = window.prompt("Link URL (https://…)"); if (url?.trim()) run("createLink", url.trim()); }}>Link</button>
      <button type="button" className="rich-tool-button" onClick={() => run("removeFormat")}>Clear</button>
      <button type="button" className="rich-tool-button" onClick={() => run("undo")}>Undo</button>
      <button type="button" className="rich-tool-button" onClick={() => run("redo")}>Redo</button>
    </div>
    <div ref={editorRef} className="rich-editor communication-editor" contentEditable suppressContentEditableWarning data-placeholder="Write the email message…" onInput={() => editorRef.current && setValue(editorRef.current.innerHTML)} onBlur={() => setValue((current) => sanitizeRichText(current))} />
    <textarea className="sr-only" aria-hidden name={name} value={value} onChange={() => {}} />
  </div>;
}
