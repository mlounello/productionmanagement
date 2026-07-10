import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Production Management",
  description: "Siena production operations platform"
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link className="brand" href="/projects">
            Production Management
          </Link>
          <nav aria-label="Primary navigation">
            <Link href="/projects">Projects</Link>
            {user ? <Link href="/people">People</Link> : null}
            {user ? <Link href="/settings/reference-data">Settings</Link> : null}
            {user ? (
              <form action="/logout" className="nav-signout-form" method="post">
                <button className="nav-signout-button" type="submit">
                  Sign out
                </button>
              </form>
            ) : (
              <Link href="/login">Sign in</Link>
            )}
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
