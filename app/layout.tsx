import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Production Management",
  description: "Siena production operations platform"
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  let hasInternalAccess = false;
  if (user) {
    const supabase = await createSupabaseServerClient();
    const { data: role } = await supabase.rpc("get_user_role");
    hasInternalAccess = Boolean(role && role !== "none");
  }

  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link className="brand" href={user && !hasInternalAccess ? "/my-profile" : "/projects"}>
            Production Management
          </Link>
          <nav aria-label="Primary navigation">
            {hasInternalAccess ? <Link href="/projects">Projects</Link> : null}
            {user ? <Link href="/my-profile">My Profile</Link> : null}
            {hasInternalAccess ? <Link href="/people">People</Link> : null}
            {hasInternalAccess ? <Link href="/settings/reference-data">Settings</Link> : null}
            {user ? (
              <form action="/logout" className="nav-signout-form" method="post">
                <button className="nav-signout-button" type="submit">
                  Sign out
                </button>
              </form>
            ) : (
              <><Link href="/profile-access">Update Profile</Link><Link href="/login">Staff Sign In</Link></>
            )}
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
