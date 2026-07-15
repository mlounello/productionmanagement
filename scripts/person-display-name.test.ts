import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's built-in TypeScript loader requires the extension.
import {firstAndLastName} from "../lib/person-display-name.ts";

test("publicity credit uses only structured first and last names",()=>{
  assert.equal(firstAndLastName({first_name:"Michael",last_name:"Lounello",full_name:"Michael R. Lounello"}),"Michael Lounello");
});

test("falls back safely when structured names are incomplete",()=>{
  assert.equal(firstAndLastName({first_name:"Michael",last_name:"",full_name:"Michael R. Lounello"}),"Michael");
  assert.equal(firstAndLastName({first_name:"",last_name:"",full_name:"Michael R. Lounello"}),"Michael R. Lounello");
});
