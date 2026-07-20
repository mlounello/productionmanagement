import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's built-in TypeScript loader requires the extension.
import { auditionDay, filterAuditionSlotChoices } from "../lib/audition-slot-dependencies.ts";

const choices=[
  {id:"a1",sessionId:"acting-a",label:"Acting A",startsAt:"2026-09-14T23:00:00.000Z"},
  {id:"b1",sessionId:"acting-b",label:"Acting B",startsAt:"2026-09-15T01:00:00.000Z"},
  {id:"c1",sessionId:"acting-c",label:"Acting C",startsAt:"2026-09-15T23:00:00.000Z"}
];

test("same-day dependencies retain every slot on the selected local audition day",()=>{
  const monday=auditionDay("2026-09-14T22:00:00.000Z");
  assert.deepEqual(filterAuditionSlotChoices(choices,"same_day",monday,"dance-a",{}).map((choice)=>choice.id),["a1","b1"]);
});

test("mapped dependencies retain only sessions explicitly opened by the selected answer",()=>{
  const map={"dance-a":["acting-a"],"dance-b":["acting-b"]};
  assert.deepEqual(filterAuditionSlotChoices(choices,"mapped_sessions","2026-09-14","dance-b",map).map((choice)=>choice.id),["b1"]);
});
