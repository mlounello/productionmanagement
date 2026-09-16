import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's TypeScript loader requires explicit extensions.
import { castingOfferEmail } from "../lib/casting-offer-email.ts";

const offer = { public_token: "00000000-0000-4000-8000-000000000000", snapshot: { person_name: "Alex Actor", project_title: "Rent", role_name: "Ensemble", coverage_type: "none", covered_roles: [], actor_notes: "<p>Welcome to the company.</p>", additional_duties: "" } } as never;
test("casting offer email includes the reviewed role and private response link", () => {
  const email = castingOfferEmail(offer, "https://productionmanagement.mlounello.com/");
  assert.equal(email.subject, "Rent role offer — Ensemble");
  assert.match(email.html, /Hello Alex Actor/);
  assert.match(email.html, /role of <strong>Ensemble<\/strong>/);
  assert.match(email.html, /\/casting-offer\/00000000-0000-4000-8000-000000000000/);
  assert.doesNotMatch(email.html, /onboarding begins immediately/i);
});
