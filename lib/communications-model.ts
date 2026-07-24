export type CommunicationCandidate = {
  personId: string;
  assignmentId?: string;
  auditionSubmissionId?: string;
  email: string;
  fullName: string;
  preferredName: string;
  roleName: string;
  roleGroup: string;
  assignmentStatus: string;
  auditionStatus: string;
  auditionRecommendations?: string[];
};

export type AudienceSelection = { mode: "all" | "role_group" | "assignment_status" | "audition_status" | "audition_recommendation" | "individual"; value?: string; personIds?: string[] };

export function selectCommunicationCandidates(candidates: CommunicationCandidate[], selection: AudienceSelection) {
  const selected = candidates.filter((candidate) => {
    if (!candidate.email.trim()) return false;
    if (selection.mode === "all") return true;
    if (selection.mode === "role_group") return candidate.roleGroup === selection.value;
    if (selection.mode === "assignment_status") return candidate.assignmentStatus === selection.value;
    if (selection.mode === "audition_status") return candidate.auditionStatus === selection.value;
    if (selection.mode === "audition_recommendation") return (candidate.auditionRecommendations ?? []).includes(selection.value ?? "");
    return (selection.personIds ?? []).includes(candidate.personId);
  });
  const byEmail = new Map<string, CommunicationCandidate>();
  for (const candidate of selected) {
    const key = candidate.email.trim().toLowerCase();
    const current = byEmail.get(key);
    if (!current) byEmail.set(key, { ...candidate, email: key });
    else byEmail.set(key, { ...current, roleName: [...new Set([current.roleName, candidate.roleName].filter(Boolean))].join(", "), roleGroup: [...new Set([current.roleGroup, candidate.roleGroup].filter(Boolean))].join(", ") });
  }
  return [...byEmail.values()].sort((a, b) => (a.preferredName || a.fullName).localeCompare(b.preferredName || b.fullName));
}

export function communicationTypeLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
