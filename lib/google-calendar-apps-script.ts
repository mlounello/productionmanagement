type CalendarBridgeResponse = { ok?: boolean; error?: string; [key: string]: unknown };

function configuration() {
  const url = (process.env.GOOGLE_CALENDAR_APPS_SCRIPT_URL || process.env.GOOGLE_GROUPS_APPS_SCRIPT_URL)?.trim();
  const secret = (process.env.GOOGLE_CALENDAR_APPS_SCRIPT_SHARED_SECRET || process.env.GOOGLE_GROUPS_APPS_SCRIPT_SHARED_SECRET)?.trim();
  if (!url || !secret) throw new Error("Google Calendar Apps Script URL or shared secret is not configured.");
  if (!url.startsWith("https://script.google.com/") && !url.startsWith("https://script.googleusercontent.com/")) throw new Error("Google Calendar Apps Script URL is invalid.");
  return { url, secret };
}

async function request(payload: Record<string, unknown>) {
  const { url, secret } = configuration();
  const response = await fetch(url, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({...payload,secret}), cache:"no-store", redirect:"follow" });
  const result = await response.json().catch(() => ({})) as CalendarBridgeResponse;
  if (!response.ok || result.ok !== true) throw new Error(String(result.error ?? `Google Calendar bridge failed (${response.status}).`));
  return result;
}

export async function testGoogleCalendarAccess(calendarId:string) {
  return request({action:"test_calendar",calendarId});
}

export async function upsertGoogleCalendarEvent(input:{calendarId:string;eventId?:string|null;title:string;description:string;location:string;startsAt:string;endsAt:string;guestEmails:string[]}) {
  return request({action:"upsert_calendar_event",...input});
}

export async function deleteGoogleCalendarEvent(calendarId:string,eventId:string) {
  return request({action:"delete_calendar_event",calendarId,eventId});
}
