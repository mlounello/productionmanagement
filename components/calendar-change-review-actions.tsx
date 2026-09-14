"use client";

import { useState } from "react";

type ReviewAction = (formData: FormData) => void | Promise<void>;

export function CalendarChangeReviewActions({
  action,
  projectId,
  changeId,
  approveDisabled = false,
}: {
  action: ReviewAction;
  projectId: string;
  changeId: string;
  approveDisabled?: boolean;
}) {
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);

  const buttonContent = (decision: "approve" | "deny", label: string) => (
    <>
      {busy === decision ? <span className="button-spinner" aria-hidden="true" /> : null}
      {busy === decision ? (decision === "approve" ? "Approving…" : "Reverting…") : label}
    </>
  );

  return (
    <div className="form-actions" aria-busy={busy !== null}>
      <form action={action} onSubmit={() => setBusy("approve")}>
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="changeId" value={changeId} />
        <input type="hidden" name="decision" value="approve" />
        <button type="submit" disabled={approveDisabled || busy !== null}>
          {buttonContent("approve", "Approve")}
        </button>
      </form>
      <form action={action} onSubmit={() => setBusy("deny")}>
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="changeId" value={changeId} />
        <input type="hidden" name="decision" value="deny" />
        <button className="button secondary" type="submit" disabled={busy !== null}>
          {buttonContent("deny", "Deny & revert")}
        </button>
      </form>
      {busy ? <span className="sr-only" role="status">Calendar change is being processed.</span> : null}
    </div>
  );
}
