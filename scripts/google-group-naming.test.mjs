import test from "node:test";
import assert from "node:assert/strict";
import { generateGoogleGroupEmail } from "../lib/google-group-naming.mjs";

test("generates Siena group email with configured suffix", () => {
  assert.equal(generateGoogleGroupEmail("rent", "stage_crew", { domain: "siena.edu", suffix: "-group" }), "rent-production-stage-crew-group@siena.edu");
});

test("generates Siena group email without a suffix", () => {
  assert.equal(generateGoogleGroupEmail("rent", "stage_crew", { domain: "siena.edu", suffix: "" }), "rent-production-stage-crew@siena.edu");
});

test("normalizes punctuation without hard-coding Siena naming", () => {
  assert.equal(generateGoogleGroupEmail("Rent: Spring 2027", "Front of House", { domain: "groups.example.edu", suffix: "-list" }), "rent-spring-2027-production-front-of-house-list@groups.example.edu");
});
