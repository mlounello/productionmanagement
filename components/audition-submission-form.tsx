"use client";

import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import { submitAuditionAction } from "@/app/auditions/[token]/actions";
import { auditionUploadSizeLabel, auditionUploadTooLarge } from "@/lib/audition-upload";

type PendingUpload = { fieldKey: string; file: File };

export function AuditionSubmissionForm({
  token,
  profileSession,
  fieldDefinitions,
  children
}: {
  token: string;
  profileSession: string;
  fieldDefinitions: string;
  children: ReactNode;
}) {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const uploads: PendingUpload[] = [];

    for (const input of Array.from(form.querySelectorAll<HTMLInputElement>('input[type="file"]'))) {
      const file = input.files?.[0];
      if (!file || !file.size) {
        formData.delete(input.name);
        continue;
      }
      if (auditionUploadTooLarge(file)) {
        setError(`${file.name} exceeds the ${auditionUploadSizeLabel()} upload limit.`);
        input.focus();
        return;
      }
      uploads.push({ fieldKey: input.name, file });
      formData.delete(input.name);
    }

    formData.set("pendingUploadKeys", JSON.stringify(uploads.map((upload) => upload.fieldKey)));
    setError("");
    setSubmitting(true);

    try {
      const result = await submitAuditionAction(formData);
      if (!result.ok) {
        setError(result.error);
        setSubmitting(false);
        return;
      }

      const warnings: string[] = result.warning ? [result.warning] : [];
      for (const upload of uploads) {
        const uploadData = new FormData();
        uploadData.set("accessToken", result.accessToken);
        uploadData.set("fieldKey", upload.fieldKey);
        uploadData.set("file", upload.file);
        const response = await fetch("/api/auditions/files", { method: "POST", body: uploadData });
        if (!response.ok) {
          const body = await response.json().catch(() => ({})) as { error?: string };
          warnings.push(body.error ?? `${upload.file.name} could not be uploaded.`);
        }
      }

      const destination = new URL(`/auditions/${token}/confirmation`, window.location.origin);
      destination.searchParams.set("access", result.accessToken);
      if (warnings.length) destination.searchParams.set("warning", warnings.join(" "));
      window.location.assign(destination.toString());
    } catch (submissionError) {
      console.error("Audition submission failed", submissionError);
      setError("We could not submit the audition form. Your information has not been lost; please try again.");
      setSubmitting(false);
    }
  }

  return <form className="stacked-form" onSubmit={submit} encType="multipart/form-data" aria-busy={submitting} data-submitting={submitting ? "true" : "false"}>
    <input type="hidden" name="formToken" value={token} />
    <input type="hidden" name="profileSession" value={profileSession}/>
    <input type="hidden" name="fieldDefinitions" value={fieldDefinitions} />
    {children}
    {error ? <p className="setup-warning audition-submit-message" role="alert">{error}</p> : null}
    {submitting ? <p className="audition-submit-progress" role="status">Submitting your audition form. Please keep this page open.</p> : null}
    <button className="audition-submit-button" type="submit" disabled={submitting}>{submitting ? "Submitting…" : "Submit audition form"}</button>
  </form>;
}
