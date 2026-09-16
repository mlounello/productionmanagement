import { z } from "zod";

export const castingDraftSchema = z.object({
  projectId: z.string().uuid(),
  id: z.string().uuid().optional(),
  revision: z.coerce.number().int().positive().optional(),
  personId: z.string().uuid(),
  roleId: z.string().uuid(),
  coverageType: z.enum(["none", "understudy", "swing"]),
  coveredRoleIds: z.array(z.string().uuid()).max(100),
  additionalDuties: z.string().trim().max(5000),
  actorNotes: z.string().trim().max(10000),
}).superRefine((value, context) => {
  if (value.id && !value.revision) context.addIssue({ code: "custom", message: "Reload this draft before saving." });
  if (value.coverageType !== "none" && !value.coveredRoleIds.length) context.addIssue({ code: "custom", message: "Select the roles this understudy or swing covers." });
});

export type CastingDraft = {
  id: string; project_id: string; person_id: string; role_id: string;
  coverage_type: "none" | "understudy" | "swing"; covered_role_ids: string[];
  additional_duties: string; actor_notes: string; status: "draft" | "withdrawn";
  revision: number;
};
export type CastingPerson = { id: string; full_name: string; email: string; person_type: string };
export type CastingRole = { id: string; name: string; role_group: string; allows_multiple_assignments: boolean; assignment_capacity: number | null };
export type CastingAssignment = { person_id: string; role_id: string; status: string };

export const companyInvitation = "We want you in the company! We want to provide everyone with work that interests them, gives them room to develop a character, and fits them vocally. The score gives us opportunities to divide songs and solos among the company. Your initial offer is for Ensemble; specific characters and assignments will develop as we work together. Listen to the show and start thinking about the roles you would enjoy exploring and developing.";

export function draftWarnings(draft: Pick<CastingDraft, "id" | "person_id" | "role_id">, people: CastingPerson[], roles: CastingRole[], drafts: CastingDraft[], assignments: CastingAssignment[]) {
  const warnings: string[] = [];
  const person = people.find((row) => row.id === draft.person_id);
  const role = roles.find((row) => row.id === draft.role_id);
  if (!person?.email.trim()) warnings.push("Email address missing");
  if (!role) return [...warnings, "Role unavailable"];
  const active = assignments.filter((row) => row.role_id === role.id && !["declined", "withdrawn"].includes(row.status));
  if (active.some((row) => row.person_id === draft.person_id)) warnings.push("Already assigned to this role — review before sending");
  const planned = new Set([...active.map((row) => row.person_id), ...drafts.filter((row) => row.status === "draft" && row.role_id === role.id).map((row) => row.person_id), draft.person_id]);
  const capacity = role.allows_multiple_assignments ? role.assignment_capacity : 1;
  if (capacity !== null && planned.size > capacity) warnings.push(`${planned.size} people planned for ${capacity} place${capacity === 1 ? "" : "s"}`);
  return warnings;
}
