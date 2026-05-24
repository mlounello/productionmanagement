import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Production Management",
  description: "Siena production operations platform"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link className="brand" href="/projects">
            Production Management
          </Link>
          <nav aria-label="Primary navigation">
            <Link href="/projects">Projects</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
