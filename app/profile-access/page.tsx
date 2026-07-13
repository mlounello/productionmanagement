import Link from "next/link";
import { redirect } from "next/navigation";
import { SITE_URL } from "@/lib/config";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

async function sendProfileLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect("/profile-access?error=Email%20is%20required.");

  const supabase = await createSupabaseServerClient();
  const next = encodeURIComponent("/my-profile");
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${SITE_URL}/auth/callback?next=${next}`, shouldCreateUser: true }
  });
  if (error) redirect(`/profile-access?error=${encodeURIComponent(error.message)}`);
  redirect("/profile-access?sent=true");
}

export default async function ProfileAccessPage({ searchParams }: { searchParams?: Promise<{ error?: string; sent?: string }> }) {
  if (await getCurrentUser()) redirect("/my-profile");
  const query = await searchParams;
  return (
    <div className="page">
      <section className="panel" style={{ maxWidth: 560 }}>
        <p className="eyebrow">Contributor Profile</p>
        <h1>Update your production profile</h1>
        <p className="muted">No account setup or password is required. We will email you a private, one-time sign-in link and connect it to the matching person record.</p>
        {query?.error ? <p className="setup-warning">{query.error}</p> : null}
        {query?.sent ? <p className="setup-success">Check your email for your secure profile link. It can only be used once.</p> : null}
        <form action={sendProfileLink} className="stacked-form">
          <label className="field"><span>Email address</span><input name="email" type="email" autoComplete="email" required /></label>
          <button type="submit">Email my secure profile link</button>
        </form>
        <p className="muted"><Link href="/login">Staff sign in</Link></p>
      </section>
    </div>
  );
}
