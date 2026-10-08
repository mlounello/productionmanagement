"use client";

import { useEffect, useState } from "react";

type DraftValue = { kind: "value"; value: string } | { kind: "checked"; value: boolean };

type Props = {
  formId: string;
  storageKey: string;
  excludeNames?: string[];
  clearWhenSuccessIncludes?: string;
};

export function FormDraftPreserver({ formId, storageKey, excludeNames = [], clearWhenSuccessIncludes }: Props) {
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;

    const success = new URLSearchParams(window.location.search).get("success") ?? "";
    if (clearWhenSuccessIncludes && success.includes(clearWhenSuccessIncludes)) {
      window.sessionStorage.removeItem(storageKey);
      return;
    }

    const excluded = new Set(excludeNames);
    const fields = () => Array.from(form.elements).filter((element): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement => {
      return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
    }).filter((element) => Boolean(element.name) && !excluded.has(element.name) && element.type !== "submit" && element.type !== "button" && element.type !== "file");

    try {
      const saved = window.sessionStorage.getItem(storageKey);
      if (saved) {
        const values = JSON.parse(saved) as Record<string, DraftValue>;
        for (const element of fields()) {
          const draft = values[element.name];
          if (!draft) continue;
          if (draft.kind === "checked" && element instanceof HTMLInputElement) element.checked = draft.value;
          if (draft.kind === "value") element.value = draft.value;
        }
        setRestored(true);
      }
    } catch {
      window.sessionStorage.removeItem(storageKey);
    }

    const saveDraft = () => {
      const values: Record<string, DraftValue> = {};
      for (const element of fields()) {
        values[element.name] = element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)
          ? { kind: "checked", value: element.checked }
          : { kind: "value", value: element.value };
      }
      window.sessionStorage.setItem(storageKey, JSON.stringify(values));
    };

    form.addEventListener("input", saveDraft);
    form.addEventListener("change", saveDraft);
    return () => {
      form.removeEventListener("input", saveDraft);
      form.removeEventListener("change", saveDraft);
    };
  }, [clearWhenSuccessIncludes, excludeNames, formId, storageKey]);

  return restored ? <p className="setup-success" role="status">Your unsaved profile draft was restored in this browser session.</p> : null;
}
