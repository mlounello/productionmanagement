import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's built-in TypeScript loader requires the extension.
import {buildSienaProductionSchedule,isThursdayOpening} from "../lib/siena-production-schedule.ts";

test("builds the standard schedule from a Thursday opening",()=>{
  const schedule=buildSienaProductionSchedule("2026-11-12");
  assert.match(schedule.techSchedule,/Designer Run: November 4, 2026, 6:00pm to 10:00pm/);
  assert.match(schedule.techSchedule,/Preview\/Photo Call: November 11, 2026, 6:00pm to 11:00pm/);
  assert.match(schedule.performanceSchedule,/Performance 4 \(Matinee\): November 15, 2026, 1:00pm to 6:00pm/);
  assert.match(schedule.performanceSchedule,/Performance 7 \(Closing Night\): November 21, 2026, 6:00pm to 11:00pm/);
  assert.match(schedule.performanceSchedule,/Strike: Immediately following Performance 7/);
});

test("rejects an opening date that would shift the standard weekday pattern",()=>{
  assert.equal(isThursdayOpening("2026-11-12"),true);
  assert.equal(isThursdayOpening("2026-11-13"),false);
  assert.throws(()=>buildSienaProductionSchedule("2026-11-13"),/Thursday opening night/);
});
