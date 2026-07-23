import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/202607232000_audition_operations_hotfix.sql",
    import.meta.url,
  ),
  "utf8",
);
const exportRoute = readFileSync(
  new URL("../app/api/projects/[projectId]/auditions/export/route.ts", import.meta.url),
  "utf8",
);
const calendarSync = readFileSync(
  new URL("../lib/audition-calendar-sync.ts", import.meta.url),
  "utf8",
);
const auditionActions = readFileSync(
  new URL("../app/projects/[projectId]/auditions/actions.ts", import.meta.url),
  "utf8",
);

test("calendar service receives only required audition table privileges", () => {
  assert.match(
    migration,
    /grant select on table app_production_management\.audition_sessions\s+to service_role/i,
  );
  assert.match(
    migration,
    /grant select, update on table app_production_management\.audition_slots\s+to service_role/i,
  );
  assert.doesNotMatch(migration, /\b(insert|delete|truncate|drop)\b/i);
});

test("PDF export selects the primary audition slot relationship explicitly", () => {
  assert.match(
    exportRoute,
    /audition_slots!audition_submissions_slot_id_fkey\(starts_at\)/,
  );
});

test("calendar staff paths preserve PostgREST error messages", () => {
  assert.match(calendarSync, /typeof error\.message==="string"/);
  assert.match(auditionActions, /calendarErrorMessage\(error,"Calendar sync failed\."\)/);
});
