import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's TypeScript loader requires explicit extensions.
import { conflictWindowSummary, parseConflictResponses } from "../lib/rehearsal-conflicts.ts";

const fixed = { id:"00000000-0000-4000-8000-000000000001",label:"Monday rehearsal",recurrence_type:"weekly",day_of_week:1,event_date:null,starts_at:"18:00:00",ends_at:"22:00:00",call_type:"fixed",max_call_minutes:null,collect_preferences:false,applies_to:"cast",required:true,instructions:"" } as const;
const flexible = { ...fixed,id:"00000000-0000-4000-8000-000000000002",label:"Sunday window",day_of_week:0,starts_at:"10:00:00",ends_at:"18:00:00",call_type:"flexible",max_call_minutes:240,collect_preferences:true } as const;

test("required windows must all be answered",()=>assert.throws(()=>parseConflictResponses("[]",[fixed],true),/Choose your availability/));
test("unavailable ranges are retained when inside the window",()=>{
  const result=parseConflictResponses(JSON.stringify([{window_id:fixed.id,availability:"unavailable",unavailable:[{starts_at:"19:00",ends_at:"20:30",reason:"Class"}],preference_enabled:false,preference_start:"",preference_end:"",preference_notes:""}]),[fixed],true);
  assert.equal(result[0].unavailable[0].reason,"Class");
});
test("ranges outside the configured window are rejected",()=>assert.throws(()=>parseConflictResponses(JSON.stringify([{window_id:fixed.id,availability:"unavailable",unavailable:[{starts_at:"17:30",ends_at:"18:30",reason:""}],preference_enabled:false,preference_start:"",preference_end:"",preference_notes:""}]),[fixed],true),/must stay between/));
test("preferences are only accepted on configured flexible windows",()=>assert.throws(()=>parseConflictResponses(JSON.stringify([{window_id:fixed.id,availability:"available",unavailable:[],preference_enabled:true,preference_start:"18:00",preference_end:"20:00",preference_notes:""}]),[fixed],true),/preferred time/i));
test("summary explains flexible maximum call length",()=>assert.match(conflictWindowSummary(flexible),/call lasts no more than 4 hours/));
