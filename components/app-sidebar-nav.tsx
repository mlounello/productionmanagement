"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/dashboard", label: "Operations Dashboard" },
  { href: "/projects", label: "Projects" },
  { href: "/people", label: "People" },
  { href: "/settings/reference-data", label: "Settings" },
  { href: "/settings/intake", label: "Intake Forms" }
];

export function AppSidebarNav() {
  const pathname = usePathname();
  return <nav aria-label="Application navigation">{items.map((item) => {
    const active = pathname === item.href || (item.href === "/projects" && pathname.startsWith("/projects/")) || (item.href === "/people" && pathname.startsWith("/people/"));
    return <Link aria-current={active ? "page" : undefined} className={active ? "active" : ""} href={item.href} key={item.href}>{item.label}</Link>;
  })}</nav>;
}
