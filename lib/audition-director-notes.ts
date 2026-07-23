type DirectorNotesRole = {
  name: string;
  role_group: string;
  role_assignments?: Array<{ status?: string | null }> | null;
};

const unavailableStatuses = new Set(["declined", "withdrawn"]);

export function availableActorRoleNames(roles: DirectorNotesRole[]) {
  const names = roles
    .filter((role) => role.role_group === "cast")
    .filter((role) =>
      (role.role_assignments ?? []).every((assignment) =>
        unavailableStatuses.has(String(assignment.status ?? "").toLowerCase()),
      ),
    )
    .map((role) => role.name.trim())
    .filter((name) => name && name.toLowerCase() !== "ensemble");

  return [...new Set(names)].sort((left, right) => left.localeCompare(right));
}
