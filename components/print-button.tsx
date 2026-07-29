"use client";

export function PrintButton({ label = "Print or save as PDF" }: { label?: string }) {
  return (
    <button className="button secondary" type="button" onClick={() => window.print()}>
      {label}
    </button>
  );
}
