import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Node's built-in TypeScript loader requires the extension.
import { selectCommunicationCandidates, type CommunicationCandidate } from "../lib/communications-model.ts";

const candidates: CommunicationCandidate[] = [
  { personId: "1", assignmentId: "a", email: "A@example.edu", fullName: "Alex Actor", preferredName: "Alex", roleName: "Dolly", roleGroup: "cast", assignmentStatus: "accepted", auditionStatus: "cast" },
  { personId: "1", assignmentId: "b", email: "a@example.edu", fullName: "Alex Actor", preferredName: "Alex", roleName: "Ensemble", roleGroup: "cast", assignmentStatus: "accepted", auditionStatus: "cast" },
  { personId: "2", assignmentId: "c", email: "crew@example.edu", fullName: "Casey Crew", preferredName: "Casey", roleName: "Electrician", roleGroup: "production_team", assignmentStatus: "offered", auditionStatus: "" },
];

test("selects an audience and deduplicates people with multiple roles", () => {
  const result = selectCommunicationCandidates(candidates, { mode: "role_group", value: "cast" });
  assert.equal(result.length, 1);
  assert.equal(result[0].email, "a@example.edu");
  assert.equal(result[0].roleName, "Dolly, Ensemble");
});

test("individual selection excludes missing and unselected people", () => {
  assert.deepEqual(selectCommunicationCandidates(candidates, { mode: "individual", personIds: ["2"] }).map((item) => item.personId), ["2"]);
});

test("audition next-step audience selects any reviewer recommendation without emailing on status change", () => {
  const candidates = [
    { personId: "1", email: "callback@example.com", fullName: "Callback Person", preferredName: "", roleName: "Audition applicant", roleGroup: "auditions", assignmentStatus: "", auditionStatus: "auditioned", auditionRecommendations: ["callback", "discuss"] },
    { personId: "2", email: "consider@example.com", fullName: "Consider Person", preferredName: "", roleName: "Audition applicant", roleGroup: "auditions", assignmentStatus: "", auditionStatus: "auditioned", auditionRecommendations: ["consider"] },
  ];
  const selected = selectCommunicationCandidates(candidates, { mode: "audition_recommendation", value: "callback" });
  assert.deepEqual(selected.map((candidate) => candidate.email), ["callback@example.com"]);
});
