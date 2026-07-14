export const dashboardModuleDefinitions = [
  { key: "project_summary", label: "Project Summary", description: "Dates, status, and core project totals." },
  { key: "role_status", label: "Role Status", description: "Filled and vacant role counts." },
  { key: "assignment_status", label: "Assignment Status", description: "Offers, acceptances, and assignment progress." },
  { key: "publicity_status", label: "Publicity Approvals", description: "Profile, approval, and Playbill publicity status." },
  { key: "integration_health", label: "Integration Health", description: "Playbill, Budget, and sync warnings." },
  { key: "people_notes", label: "People & Notes", description: "Project people and recent note activity." }
] as const;

export type DashboardModuleKey = (typeof dashboardModuleDefinitions)[number]["key"];
export type DashboardModuleSize = "compact" | "half" | "full";
export type DashboardLayoutItem = { key: DashboardModuleKey; size: DashboardModuleSize };

export const defaultDashboardLayout: DashboardLayoutItem[] = [
  { key: "project_summary", size: "full" },
  { key: "role_status", size: "half" },
  { key: "publicity_status", size: "half" },
  { key: "integration_health", size: "half" }
];

export function normalizeDashboardLayout(value: unknown): DashboardLayoutItem[] {
  if (!Array.isArray(value)) return defaultDashboardLayout;
  const allowed = new Set(dashboardModuleDefinitions.map((item) => item.key));
  const seen = new Set<string>();
  const result: DashboardLayoutItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const key = String((item as Record<string, unknown>).key ?? "") as DashboardModuleKey;
    if (!allowed.has(key) || seen.has(key)) continue;
    const rawSize = String((item as Record<string, unknown>).size ?? "half");
    const size: DashboardModuleSize = rawSize === "compact" || rawSize === "full" ? rawSize : "half";
    seen.add(key);
    result.push({ key, size });
  }
  return result.length ? result : defaultDashboardLayout;
}
