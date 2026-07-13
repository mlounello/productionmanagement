import { notFound } from "next/navigation";
import { getProfileAccessLink } from "@/lib/profile-access-links";

export const dynamic = "force-dynamic";

export default async function ProfileAccessContinuePage({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const access = await getProfileAccessLink(token);
  if (!access) notFound();
  const person = access.people as unknown as { full_name: string; preferred_name: string } | null;
  return <div className="page"><section className="panel" style={{ maxWidth: 600 }}>
    <p className="eyebrow">Secure Profile Access</p>
    <h1>Ready to open your profile?</h1>
    <p><strong>{person?.preferred_name || person?.full_name || "Production contributor"}</strong></p>
    <p className="muted">Press Continue to create a fresh one-time session and open your Production Management profile. Opening this page alone does not sign you in.</p>
    {query?.error ? <p className="setup-warning">{query.error}</p> : null}
    <form action={`/profile-access/${encodeURIComponent(token)}/continue`} method="post"><button type="submit">Continue to my profile</button></form>
  </section></div>;
}
