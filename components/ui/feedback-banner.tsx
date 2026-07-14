"use client";

import { useEffect, useRef } from "react";

export function FeedbackBanner({ error, success }: { error?: string; success?: string }) {
  const message = error || success;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!message) return;
    ref.current?.focus({ preventScroll: true });
    ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [message]);

  if (!message) return null;
  const isError = Boolean(error);
  return (
    <div ref={ref} tabIndex={-1} role={isError ? "alert" : "status"} aria-live={isError ? "assertive" : "polite"} className={`feedback-banner ${isError ? "feedback-error" : "feedback-success"}`}>
      <strong>{isError ? "Action needed" : "Done"}</strong>
      <span>{message}</span>
    </div>
  );
}
