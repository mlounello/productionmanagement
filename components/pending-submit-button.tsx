"use client";

import { useFormStatus } from "react-dom";

export function PendingSubmitButton({
  children,
  pendingLabel,
  className,
  disabled = false,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={disabled || pending} aria-busy={pending}>
      {pending ? <span className="button-spinner" aria-hidden="true" /> : null}
      {pending ? pendingLabel : children}
    </button>
  );
}
