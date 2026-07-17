import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { sendProfileAccessForEmail } from "@/lib/profile-access-links";

export const dynamic = "force-dynamic";

async function sendProfileLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect("/profile-access?error=Email%20is%20required.");

  try {
    await sendProfileAccessForEmail(email);
  } catch {
    // Keep the response neutral so this form cannot reveal who is in the system.
  }
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
        <p className="muted">No account setup or password is required. Enter the email address stored on your Production Management profile. This may be a Siena address or a personal address. If you have received production messages from us, use the address where those messages were delivered.</p>
        {query?.error ? <p className="setup-warning">{query.error}</p> : null}
        {query?.sent ? <p className="setup-success">If that email matches a profile, a secure access message has been sent.</p> : null}
        <form action={sendProfileLink} className="stacked-form">
          <label className="field"><span>Email address on your profile</span><input name="email" type="email" autoComplete="email" required /><small>Siena and personal email addresses are both accepted.</small></label>
          <button type="submit">Email my secure profile link</button>
        </form>
        <p className="muted"><Link href="/login">Staff sign in</Link></p>
      </section>
    </div>
  );
}
