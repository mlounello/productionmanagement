"use client";

import { useEffect, useRef } from "react";

type SavedControl = { value?: string; checked?: boolean };

export function RememberedAuditionBlockForm({ projectId, action, children }: {
  projectId: string;
  action: (formData: FormData) => void | Promise<void>;
  children: React.ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const storageKey = `production-management:audition-block:${projectId}`;

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Record<string, SavedControl>;
      for (const control of Array.from(form.elements)) {
        if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) || !control.name || control.type === "hidden") continue;
        const value = saved[control.name];
        if (!value) continue;
        if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) control.checked = Boolean(value.checked);
        else if (value.value !== undefined) control.value = value.value;
      }
    } catch {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  function rememberValues() {
    const form = formRef.current;
    if (!form) return;
    const saved: Record<string, SavedControl> = {};
    for (const control of Array.from(form.elements)) {
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) || !control.name || control.type === "hidden") continue;
      saved[control.name] = control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")
        ? { checked: control.checked }
        : { value: control.value };
    }
    localStorage.setItem(storageKey, JSON.stringify(saved));
  }

  function clearRememberedValues() {
    localStorage.removeItem(storageKey);
    formRef.current?.reset();
  }

  return <form ref={formRef} action={action} onSubmit={rememberValues} className="stacked-form">
    {children}
    <div className="form-actions"><button type="submit">Create audition or callback block</button><button className="button secondary" type="button" onClick={clearRememberedValues}>Clear remembered values</button></div>
  </form>;
}
