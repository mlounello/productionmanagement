"use client";

import { useEffect, useRef } from "react";

type SavedControl = { value?: string; checked?: boolean };
type SavedForm = Record<string, SavedControl> & { __capacityByFormat?: Record<string, string> };

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
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as SavedForm;
      for (const control of Array.from(form.elements)) {
        if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) || !control.name || control.type === "hidden") continue;
        if (control.name === "capacity" || control.name === "allowMultipleAppointmentBookings") continue;
        const value = saved[control.name];
        if (!value) continue;
        if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) control.checked = Boolean(value.checked);
        else if (value.value !== undefined) {
          control.value = value.value;
          control.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
      const sessionType = form.elements.namedItem("sessionType") as HTMLSelectElement | null;
      const capacity = form.elements.namedItem("capacity") as HTMLInputElement | null;
      if (sessionType && capacity) capacity.value = saved.__capacityByFormat?.[sessionType.value] ?? (sessionType.value === "appointments" ? "1" : saved.capacity?.value ?? capacity.value);
    } catch {
      localStorage.removeItem(storageKey);
    }

    const sessionType = form.elements.namedItem("sessionType") as HTMLSelectElement | null;
    const capacity = form.elements.namedItem("capacity") as HTMLInputElement | null;
    const multipleConfirmation = form.elements.namedItem("allowMultipleAppointmentBookings") as HTMLInputElement | null;
    if (!sessionType || !capacity) return;
    let previousType = sessionType.value;
    const changeFormat = () => {
      let saved: SavedForm = {};
      try { saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as SavedForm; } catch { /* Start fresh below. */ }
      const capacities = { ...(saved.__capacityByFormat ?? {}), [previousType]: capacity.value };
      capacity.value = capacities[sessionType.value] ?? (sessionType.value === "appointments" ? "1" : capacity.value);
      if (multipleConfirmation) multipleConfirmation.checked = false;
      saved.__capacityByFormat = capacities;
      localStorage.setItem(storageKey, JSON.stringify(saved));
      previousType = sessionType.value;
    };
    sessionType.addEventListener("change", changeFormat);
    return () => sessionType.removeEventListener("change", changeFormat);
  }, [storageKey]);

  function rememberValues() {
    const form = formRef.current;
    if (!form) return;
    let previous: SavedForm = {};
    try { previous = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as SavedForm; } catch { /* Replace invalid saved data. */ }
    const saved: SavedForm = { __capacityByFormat: { ...(previous.__capacityByFormat ?? {}) } };
    for (const control of Array.from(form.elements)) {
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) || !control.name || control.type === "hidden") continue;
      if (control.name === "allowMultipleAppointmentBookings") continue;
      saved[control.name] = control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")
        ? { checked: control.checked }
        : { value: control.value };
    }
    const sessionType = form.elements.namedItem("sessionType") as HTMLSelectElement | null;
    const capacity = form.elements.namedItem("capacity") as HTMLInputElement | null;
    if (sessionType && capacity) saved.__capacityByFormat![sessionType.value] = capacity.value;
    localStorage.setItem(storageKey, JSON.stringify(saved));
  }

  function prepareSubmission(event: React.FormEvent<HTMLFormElement>) {
    const form = formRef.current;
    if (!form) return;
    const sessionType = form.elements.namedItem("sessionType") as HTMLSelectElement | null;
    const capacity = form.elements.namedItem("capacity") as HTMLInputElement | null;
    if (sessionType?.value === "appointments" && Number(capacity?.value ?? 1) > 1) {
      const confirmed = window.confirm("This will allow multiple applicants to book the same generated appointment time. Is that intentional?");
      if (!confirmed) { event.preventDefault(); return; }
      const confirmation = document.createElement("input");
      confirmation.type = "hidden";
      confirmation.name = "allowMultipleAppointmentBookings";
      confirmation.value = "on";
      form.appendChild(confirmation);
    }
    rememberValues();
  }

  function clearRememberedValues() {
    localStorage.removeItem(storageKey);
    formRef.current?.reset();
  }

  return <form ref={formRef} action={action} onSubmit={prepareSubmission} className="stacked-form">
    {children}
    <div className="form-actions"><button type="submit">Create audition or callback block</button><button className="button secondary" type="button" onClick={clearRememberedValues}>Clear remembered values</button></div>
  </form>;
}
