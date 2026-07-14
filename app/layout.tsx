import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { AppSidebarNav } from "@/components/app-sidebar-nav";
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
        <div className={hasInternalAccess ? "app-shell" : "public-shell"}>
          {hasInternalAccess ? (
            <aside className="app-sidebar">
              <Link className="sidebar-brand" href="/dashboard"><span>PM</span><strong>Production Management</strong></Link>
              <AppSidebarNav />
            </aside>
          ) : null}
          <div className="app-content">
            <header className="site-header">
              {!hasInternalAccess ? <Link className="brand" href={user ? "/my-profile" : "/"}>Production Management</Link> : <span className="site-context">Siena Production Operations</span>}
              <nav aria-label="Account navigation">
                {user ? <Link href="/my-profile">My Profile</Link> : null}
                {user ? (
                  <form action="/logout" className="nav-signout-form" method="post"><button className="nav-signout-button" type="submit">Sign out</button></form>
                ) : (
                  <><Link href="/profile-access">Update Profile</Link><Link href="/login">Staff Sign In</Link></>
                )}
              </nav>
            </header>
            <main>{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
