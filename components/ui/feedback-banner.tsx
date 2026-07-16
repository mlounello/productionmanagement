"use client";

import { useEffect, useRef, useState } from "react";

export function FeedbackBanner({ error, success, floating = false }: { error?: string; success?: string; floating?: boolean }) {
  const message = error || success;
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(Boolean(message));

  useEffect(() => {
    if (!message) return;
    setVisible(true);
    ref.current?.focus({ preventScroll: true });
    if (!floating) ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (floating) {
      const timeout = window.setTimeout(() => setVisible(false), 6000);
      return () => window.clearTimeout(timeout);
    }
  }, [floating, message]);

  if (!message || !visible) return null;
  const isError = Boolean(error);
  return (
    <div ref={ref} tabIndex={-1} role={isError ? "alert" : "status"} aria-live={isError ? "assertive" : "polite"} className={`feedback-banner ${floating ? "feedback-floating" : ""} ${isError ? "feedback-error" : "feedback-success"}`}>
      <div><strong>{isError ? "Action needed" : "Done"}</strong><span>{message}</span></div>
      {floating ? <button type="button" aria-label="Dismiss message" onClick={() => setVisible(false)}>×</button> : null}
    </div>
  );
}
