"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

const storageKey = "prodmind:same-page-scroll";

export function SamePageScrollRestoration() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;

  useEffect(() => {
    function rememberPosition(event: SubmitEvent) {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || form.target === "_blank" || form.dataset.resetScroll === "true") return;
      window.sessionStorage.setItem(storageKey, JSON.stringify({
        pathname: window.location.pathname,
        x: window.scrollX,
        y: window.scrollY
      }));
    }
    document.addEventListener("submit", rememberPosition, true);
    return () => document.removeEventListener("submit", rememberPosition, true);
  }, []);

  useEffect(() => {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return;
    window.sessionStorage.removeItem(storageKey);
    try {
      const saved = JSON.parse(raw) as { pathname?: string; x?: number; y?: number };
      if (saved.pathname !== pathname) return;
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => window.scrollTo({
          left: Number(saved.x ?? 0),
          top: Number(saved.y ?? 0),
          behavior: "auto"
        }));
      });
    } catch {
      // Ignore stale or malformed browser storage.
    }
  }, [pathname, routeKey]);

  return null;
}
