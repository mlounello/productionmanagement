import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getProfileAccessLink } from "@/lib/profile-access-links";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function ProfileAccessContinuePage({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const access = await getProfileAccessLink(token, { includeUsed: true });
  if (!access) notFound();
  const person = access.people as unknown as { full_name: string; preferred_name: string } | null;
  if (access.used_at) {
    const user = await getCurrentUser();
    if (user) {
      const admin = createSupabaseAdminClient();
      const { data: linkedPerson } = await admin.from("people").select("id").eq("id", access.person_id).eq("auth_user_id", user.id).maybeSingle();
      if (linkedPerson) redirect(String(access.destination_path || "/my-profile"));
    }
    return <div className="page"><section className="panel" style={{ maxWidth: 600 }}>
      <p className="eyebrow">Secure Profile Access</p>
      <h1>This invitation has already been opened</h1>
      <p className="muted">For security, the sign-in portion of this invitation can only be used once. Your project access is still active.</p>
      <p>Open Production Management in the same browser and choose <strong>My Profile</strong>, where your project tools are now listed. If this browser is no longer signed in, request a fresh secure profile link first.</p>
      <div className="top-actions"><Link className="button" href="/my-profile">Open My Profile</Link><Link className="button secondary" href="/profile-access">Request a fresh link</Link></div>
    </section></div>;
  }
  return <div className="page"><section className="panel" style={{ maxWidth: 600 }}>
    <p className="eyebrow">Secure Profile Access</p>
    <h1>Ready to open your profile?</h1>
    <p><strong>{person?.preferred_name || person?.full_name || "Production contributor"}</strong></p>
    <p className="muted">Press Continue to create a fresh one-time session and open your Production Management profile. Opening this page alone does not sign you in.</p>
    {query?.error ? <p className="setup-warning">{query.error}</p> : null}
    <form action={`/profile-access/${encodeURIComponent(token)}/continue`} method="post"><button type="submit">Continue to my profile</button></form>
  </section></div>;
}
