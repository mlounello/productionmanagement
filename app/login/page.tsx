import { redirect } from "next/navigation";
import { hasSupabaseEnv, SITE_URL } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/auth";
import { GoogleLoginButton } from "@/app/login/google-login-button";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function signIn(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) {
    redirect("/login?error=Email%20is%20required");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${SITE_URL}/auth/callback`
    }
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/login?sent=true");
}

export default async function LoginPage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string; sent?: string }>;
}) {
  const params = await searchParams;

  if (await getCurrentUser()) {
    redirect("/projects");
  }

  return (
    <div className="page">
      <section className="panel" style={{ maxWidth: 520 }}>
        <p className="eyebrow">Siena Production Operations</p>
        <h1>Sign in</h1>
        <p className="muted">Staff may use a Siena Google account or staff magic link. Production contributors can use the secure profile link sent to the email address stored on their profile, including a personal address.</p>
        {!hasSupabaseEnv() ? (
          <div className="panel setup-warning">
            Supabase env vars are not configured yet. Add `.env.local` before signing in.
          </div>
        ) : null}
        {params?.error ? <p className="setup-warning">{params.error}</p> : null}
        {params?.sent ? <p>Check your email for the sign-in link.</p> : null}
        <GoogleLoginButton />
        <form action={signIn} className="form-grid">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <button type="submit">Send magic link</button>
        </form>
        <p className="muted">Only updating your contributor profile? <Link href="/profile-access">Request a secure profile link using the email address on your profile</Link>.</p>
      </section>
    </div>
  );
}
