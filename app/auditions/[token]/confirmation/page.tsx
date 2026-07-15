import Link from "next/link";
import { notFound } from "next/navigation";
import { manageAuditionBookingAction } from "@/app/auditions/[token]/actions";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function AuditionConfirmationPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ access?: string; error?: string; success?: string; warning?: string }> }) {
  const { token } = await params; const query = await searchParams;
  if (!query.access) notFound();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("get_public_audition_form", { form_token: token });
  if (!data) notFound();
  const payload = data as { form: { title: string; allow_reschedule: boolean; allow_cancel: boolean }; project: { title: string };fields:Array<{field_type:string;settings?:{booking_category?:string}}> ; slots: Array<{ id: string; session_id: string; starts_at: string; ends_at: string | null; capacity: number; booked: number }>; sessions: Array<{ id: string; title: string; location: string; booking_mode: string;booking_category:string }> };
  const sessions = new Map(payload.sessions.map((session) => [session.id, session]));
  const bookingFields=payload.fields.filter((field)=>field.field_type==="slot_selector");const singleCategory=bookingFields.length===1?(bookingFields[0].settings?.booking_category||"general"):null;
  const slots = payload.slots.filter((slot) => Number(slot.booked) < slot.capacity && sessions.get(slot.session_id)?.booking_mode === "self_book"&&(!singleCategory||(sessions.get(slot.session_id)?.booking_category||"general")===singleCategory));
  return <div className="page"><section className="panel"><p className="eyebrow">Audition received</p><h1>Thank you</h1><p>Your form for <strong>{payload.form.title}</strong> has been submitted. Save this page if you need to manage your booking.</p>
    {query.error ? <p className="setup-warning">{query.error}</p> : null}{query.success ? <p className="success-message">{query.success}</p> : null}{query.warning ? <p className="setup-warning">{query.warning}</p> : null}
    {payload.form.allow_reschedule&&bookingFields.length<=1 ? <form action={manageAuditionBookingAction} className="form-row"><input type="hidden" name="formToken" value={token} /><input type="hidden" name="accessToken" value={query.access} /><input type="hidden" name="requestedAction" value="reschedule" /><label className="field"><span>Choose a different audition time</span><select name="slotId" required defaultValue=""><option value="">Choose time</option>{slots.map((slot) => { const session = sessions.get(slot.session_id); return <option key={slot.id} value={slot.id}>{session?.title} · {new Date(slot.starts_at).toLocaleString()} · {session?.location}</option>; })}</select></label><button type="submit">Reschedule</button></form> : null}
    {payload.form.allow_reschedule&&bookingFields.length>1?<p className="muted">This production uses linked audition bookings. Contact production staff if you need to change dates so every required booking can be moved together.</p>:null}
    {payload.form.allow_cancel ? <form action={manageAuditionBookingAction}><input type="hidden" name="formToken" value={token} /><input type="hidden" name="accessToken" value={query.access} /><input type="hidden" name="requestedAction" value="cancel" /><button className="button danger" type="submit">Cancel audition registration</button></form> : null}
    <div className="form-actions"><Link className="button secondary" href={`/auditions/${token}`}>Return to audition page</Link></div>
  </section></div>;
}
