import { notFound } from "next/navigation";
import { respondToCallbackAction } from "@/app/callbacks/[token]/actions";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type Payload = {
  invitation: { status: string; slot_id: string | null };
  project: { title: string };
  applicant: { name: string; email: string };
  sessions: Array<{ id: string; title: string; location: string; instructions: string }>;
  slots: Array<{ id: string; session_id: string; starts_at: string; ends_at: string | null; capacity: number; booked: number }>;
};

function date(value: string) {
  return new Date(value).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

export default async function CallbackResponsePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams?: Promise<{ error?: string; success?: string; warning?: string }> }) {
  const { token } = await params; const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("get_public_callback_invitation", { invitation_token: token });
  if (!data) notFound();
  const payload = data as Payload;
  const sessions = new Map(payload.sessions.map((session) => [session.id, session]));
  const available = payload.slots.filter((slot) => Number(slot.booked) < Number(slot.capacity) || slot.id === payload.invitation.slot_id);
  const current = payload.slots.find((slot) => slot.id === payload.invitation.slot_id);
  return <div className="page callback-public-page"><section className="panel callback-response-card">
    <p className="eyebrow">Callback Invitation · {payload.project.title}</p>
    <h1>Hello {payload.applicant.name}</h1>
    <p>You have been invited to callbacks for <strong>{payload.project.title}</strong>. No account or audition form is required—choose an available callback time below.</p>
    {query?.error ? <p className="setup-warning">{query.error}</p> : null}
    {query?.success ? <p className="setup-success">{query.success}</p> : null}
    {query?.warning ? <p className="setup-warning">{query.warning}</p> : null}
    {current ? <div className="callback-current"><strong>Confirmed callback</strong><span>{sessions.get(current.session_id)?.title} · {date(current.starts_at)} · {sessions.get(current.session_id)?.location || "Location TBD"}</span></div> : null}
    <form action={respondToCallbackAction} className="stacked-form">
      <input type="hidden" name="token" value={token}/><input type="hidden" name="requestedAction" value="book"/>
      {available.length === 1 ? <><input type="hidden" name="slotId" value={available[0].id}/><div className="callback-choice"><strong>{sessions.get(available[0].session_id)?.title || "Callback"}</strong><span>{date(available[0].starts_at)}{available[0].ends_at ? `–${new Date(available[0].ends_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })}` : ""} · {sessions.get(available[0].session_id)?.location || "Location TBD"}</span><small>{sessions.get(available[0].session_id)?.instructions}</small></div><button type="submit">{current ? "Keep this callback time" : "Accept this callback"}</button></>
      : available.length ? <><label className="field"><span>Choose your callback time</span><select name="slotId" defaultValue={current?.id ?? ""} required><option value="">Choose an available time</option>{available.map((slot) => <option value={slot.id} key={slot.id}>{sessions.get(slot.session_id)?.title} · {date(slot.starts_at)} · {sessions.get(slot.session_id)?.location || "Location TBD"} · {Number(slot.capacity)-Number(slot.booked)} open</option>)}</select></label><button type="submit">{current ? "Update callback time" : "Confirm callback time"}</button></>
      : <p className="setup-warning">No callback times are currently available. Please contact the production team.</p>}
    </form>
    <details className="callback-decline"><summary>I cannot attend callbacks</summary><form action={respondToCallbackAction}><input type="hidden" name="token" value={token}/><input type="hidden" name="requestedAction" value="decline"/><p>Declining releases any callback reservation. This does not delete your original audition.</p><button className="button danger" type="submit">Decline callback invitation</button></form></details>
  </section></div>;
}
