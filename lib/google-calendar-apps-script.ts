type CalendarBridgeResponse = { ok?: boolean; error?: string; [key: string]: unknown };

function configuration() {
  const url = (process.env.GOOGLE_CALENDAR_APPS_SCRIPT_URL || process.env.GOOGLE_GROUPS_APPS_SCRIPT_URL)?.trim();
  const secret = (process.env.GOOGLE_CALENDAR_APPS_SCRIPT_SHARED_SECRET || process.env.GOOGLE_GROUPS_APPS_SCRIPT_SHARED_SECRET)?.trim();
  if (!url || !secret) throw new Error("Google Calendar Apps Script URL or shared secret is not configured.");
  if (!url.startsWith("https://script.google.com/") && !url.startsWith("https://script.googleusercontent.com/")) throw new Error("Google Calendar Apps Script URL is invalid.");
  return { url, secret };
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function request(payload: Record<string, unknown>, attempts = 1) {
  const { url, secret } = configuration();
  let latestError: Error | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({...payload,secret}), cache:"no-store", redirect:"follow" });
      const responseText = await response.text();
      let result: CalendarBridgeResponse = {};
      try { result = JSON.parse(responseText) as CalendarBridgeResponse; }
      catch { throw new Error(`Google Calendar bridge returned an invalid response (${response.status}).`); }
      if (!response.ok || result.ok !== true) throw new Error(String(result.error ?? `Google Calendar bridge failed (${response.status}).`));
      return result;
    } catch (error) {
      latestError = error instanceof Error ? error : new Error("Google Calendar bridge request failed.");
      if (attempt < attempts - 1) await wait(250 * (2 ** attempt));
    }
  }
  throw latestError ?? new Error("Google Calendar bridge request failed.");
}

export async function getGoogleCalendarBridgeCapabilities() {
  try {
    const result = await request({ action: "calendar_capabilities" });
    const bridgeVersion = Number(result.bridgeVersion ?? 1);
    return { bridgeVersion, idempotentUpsert: bridgeVersion >= 2 && result.idempotentUpsert === true };
  } catch {
    return { bridgeVersion: 1, idempotentUpsert: false };
  }
}

export async function testGoogleCalendarAccess(calendarId:string) {
  return request({action:"test_calendar",calendarId});
}

export async function upsertGoogleCalendarEvent(input:{calendarId:string;eventId?:string|null;externalKey:string;title:string;description:string;location:string;startsAt:string;endsAt:string;guestEmails:string[];retrySafe?:boolean}) {
  const { retrySafe, ...payload } = input;
  return request({action:"upsert_calendar_event",...payload}, retrySafe ? 3 : 1);
}

export async function deleteGoogleCalendarEvent(calendarId:string,eventId:string) {
  return request({action:"delete_calendar_event",calendarId,eventId});
}
