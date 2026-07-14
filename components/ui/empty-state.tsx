import type { ReactNode } from "react";

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty-state-card"><strong>{title}</strong>{children ? <div>{children}</div> : null}{action ? <div className="empty-state-action">{action}</div> : null}</div>;
}
