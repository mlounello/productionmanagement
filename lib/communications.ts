import { renderTemplate } from "./outbound-email";
import { sanitizeRichText } from "./rich-text";
export { communicationTypeLabel, selectCommunicationCandidates } from "./communications-model";
export type { AudienceSelection, CommunicationCandidate } from "./communications-model";
import type { CommunicationCandidate } from "./communications-model";

export const communicationTypes = ["cast_announcement", "crew_announcement", "role_confirmation", "audition_reminder", "audition_callback", "recognition", "custom"] as const;
export type CommunicationType = (typeof communicationTypes)[number];

export function communicationVariables(candidate: CommunicationCandidate, projectTitle: string, extra: Record<string, string> = {}) {
  return {
    person_name: candidate.preferredName || candidate.fullName,
    full_name: candidate.fullName,
    preferred_name: candidate.preferredName || candidate.fullName,
    project_title: projectTitle,
    role_name: candidate.roleName,
    role_group: candidate.roleGroup.replace(/_/g, " "),
    callback_response_url: candidate.callbackResponseUrl ?? "",
    ...extra,
  };
}

export function renderCommunication(subjectTemplate: string, bodyTemplate: string, variables: Record<string, string>) {
  return {
    subject: renderTemplate(subjectTemplate, variables),
    body: sanitizeRichText(renderTemplate(bodyTemplate, variables, true)),
  };
}
