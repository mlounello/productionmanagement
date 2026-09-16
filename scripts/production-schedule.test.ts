import assert from "node:assert/strict";
import test from "node:test";
import { buildSienaProductionEvents } from "../lib/siena-production-schedule.ts";
import { commitmentGroupForWindow, conflictOccurrences, isMandatoryProductionCall, sortConflictWindows, type ConflictWindowSnapshot } from "../lib/rehearsal-conflicts.ts";

test("standard structured schedule includes timed tech-through-strike calls",()=>{
  const events=buildSienaProductionEvents("2026-11-12");
  assert.equal(events.length,15);
  assert.deepEqual(events[0],{label:"Designer Run",event_date:"2026-11-04",starts_at:"18:00",ends_at:"22:00",schedule_category:"designer_run",applies_to:"all"});
  assert.deepEqual(events.at(-1),{label:"Strike",event_date:"2026-11-22",starts_at:"12:00",ends_at:"18:00",schedule_category:"strike",applies_to:"all"});
});

test("only recurring rehearsals expand into one-off conflict dates",()=>{
  const base={starts_at:"18:00",ends_at:"22:00",call_type:"fixed",max_call_minutes:null,collect_preferences:false,applies_to:"cast",required:true,instructions:""} as const;
  const windows:ConflictWindowSnapshot[]=[
    {...base,id:"11111111-1111-4111-8111-111111111111",label:"Monday rehearsal",recurrence_type:"weekly",day_of_week:1,event_date:null,schedule_category:"rehearsal"},
    {...base,id:"22222222-2222-4222-8222-222222222222",label:"Opening",recurrence_type:"date",day_of_week:null,event_date:"2026-11-12",schedule_category:"performance"}
  ];
  const occurrences=conflictOccurrences(windows,{starts_on:"2026-11-09",ends_on:"2026-11-15",excluded_dates:[]});
  assert.deepEqual(occurrences.map(item=>item.date),["2026-11-09"]);
  assert.equal(sortConflictWindows(windows)[0].label,"Monday rehearsal");
});

test("standard schedule rejects a non-Thursday opening",()=>{
  assert.throws(()=>buildSienaProductionEvents("2026-11-13"),/Thursday opening night/);
});

test("dated tech, performance, and strike calls use mandatory-call handling",()=>{
  const base={starts_at:"18:00",ends_at:"22:00",call_type:"fixed",max_call_minutes:null,collect_preferences:false,applies_to:"cast",required:true,instructions:"",recurrence_type:"date",day_of_week:null,event_date:"2026-11-12"} as const;
  const performance:ConflictWindowSnapshot={...base,id:"33333333-3333-4333-8333-333333333333",label:"Opening",schedule_category:"performance"};
  const rehearsal:ConflictWindowSnapshot={...base,id:"44444444-4444-4444-8444-444444444444",label:"Special rehearsal",schedule_category:"rehearsal"};
  assert.equal(isMandatoryProductionCall(performance),true);
  assert.equal(commitmentGroupForWindow(performance),"performance");
  assert.equal(isMandatoryProductionCall(rehearsal),false);
});
