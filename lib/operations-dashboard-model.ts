export const operationCategories = ["all", "publicity", "playbill", "budget", "google", "auditions", "calendar"] as const;
export const operationDueWindows = ["all", "overdue", "7", "30"] as const;

export type OperationCategory = Exclude<(typeof operationCategories)[number], "all">;
export type OperationDueWindow = (typeof operationDueWindows)[number];
export type OperationSeverity = "urgent" | "warning" | "info";
export type OperationKind = "attention" | "upcoming";

export type OperationItem = {
  id: string;
  projectId: string;
  projectTitle: string;
  category: OperationCategory;
  kind: OperationKind;
  severity: OperationSeverity;
  title: string;
  detail: string;
  href: string;
  dueAt: string | null;
};

export type OperationFilters = {
  projectId: string;
  category: "all" | OperationCategory;
  due: OperationDueWindow;
};

export function severityForDate(value: string | null, now = new Date()): OperationSeverity {
  if (!value) return "warning";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "warning";
  if (time < now.getTime()) return "urgent";
  if (time <= now.getTime() + 7 * 86400000) return "warning";
  return "info";
}

export function filterOperationItems(items: OperationItem[], filters: OperationFilters, now = new Date()) {
  const dueLimit = filters.due === "7" ? 7 : filters.due === "30" ? 30 : null;
  return items.filter((item) => {
    if (filters.projectId && item.projectId !== filters.projectId) return false;
    if (filters.category !== "all" && item.category !== filters.category) return false;
    if (filters.due === "all") return true;
    if (!item.dueAt) return false;
    const due = new Date(item.dueAt).getTime();
    if (!Number.isFinite(due)) return false;
    if (filters.due === "overdue") return due < now.getTime();
    return due <= now.getTime() + Number(dueLimit) * 86400000;
  });
}

export function sortOperationItems(items: OperationItem[]) {
  const severity = { urgent: 0, warning: 1, info: 2 } as const;
  return [...items].sort((left, right) => {
    const bySeverity = severity[left.severity] - severity[right.severity];
    if (bySeverity) return bySeverity;
    const leftDue = left.dueAt ? new Date(left.dueAt).getTime() : Number.POSITIVE_INFINITY;
    const rightDue = right.dueAt ? new Date(right.dueAt).getTime() : Number.POSITIVE_INFINITY;
    if (leftDue !== rightDue) return leftDue - rightDue;
    return left.projectTitle.localeCompare(right.projectTitle) || left.title.localeCompare(right.title);
  });
}
