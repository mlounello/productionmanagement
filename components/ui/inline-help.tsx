import type { ReactNode } from "react";

export function InlineHelp({ title = "How this works", children }: { title?: string; children: ReactNode }) {
  return <details className="inline-help"><summary>{title}</summary><div className="inline-help-content">{children}</div></details>;
}
