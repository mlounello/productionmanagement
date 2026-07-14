import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Node's built-in TypeScript loader requires the extension.
import { filterOperationItems, severityForDate, sortOperationItems, type OperationItem } from "../lib/operations-dashboard-model.ts";

const now = new Date("2026-07-13T16:00:00Z");
const items: OperationItem[] = [
  { id: "overdue", projectId: "a", projectTitle: "Rent", category: "publicity", kind: "attention", severity: "urgent", title: "Bio overdue", detail: "", href: "/", dueAt: "2026-07-12T16:00:00Z" },
  { id: "soon", projectId: "a", projectTitle: "Rent", category: "calendar", kind: "upcoming", severity: "warning", title: "Deadline", detail: "", href: "/", dueAt: "2026-07-18T16:00:00Z" },
  { id: "later", projectId: "b", projectTitle: "Rumors", category: "auditions", kind: "upcoming", severity: "info", title: "Auditions", detail: "", href: "/", dueAt: "2026-08-01T16:00:00Z" },
  { id: "undated", projectId: "b", projectTitle: "Rumors", category: "google", kind: "attention", severity: "warning", title: "Welcome failed", detail: "", href: "/", dueAt: null }
];

test("filters operations by project and category", () => {
  assert.deepEqual(filterOperationItems(items, { projectId: "b", category: "google", due: "all" }, now).map((item) => item.id), ["undated"]);
});

test("the seven-day filter includes overdue and near-term dated work but not undated work", () => {
  assert.deepEqual(filterOperationItems(items, { projectId: "", category: "all", due: "7" }, now).map((item) => item.id), ["overdue", "soon"]);
});

test("overdue filtering only returns dates before now", () => {
  assert.deepEqual(filterOperationItems(items, { projectId: "", category: "all", due: "overdue" }, now).map((item) => item.id), ["overdue"]);
});

test("severity and sorting prioritize overdue work", () => {
  assert.equal(severityForDate("2026-07-12T16:00:00Z", now), "urgent");
  assert.equal(severityForDate("2026-07-18T16:00:00Z", now), "warning");
  assert.equal(severityForDate("2026-08-01T16:00:00Z", now), "info");
  assert.equal(sortOperationItems(items)[0]?.id, "overdue");
});
