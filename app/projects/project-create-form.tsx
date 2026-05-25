"use client";

import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export function ProjectCreateForm({ disabled }: { disabled: boolean }) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    const form = event.currentTarget;
    const supabase = createSupabaseBrowserClient();
    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setPending(false);
      setError("The browser does not have an active Supabase session. Sign out, sign in again, and retry.");
      return;
    }

    const response = await fetch("/projects/create", {
      body: new FormData(form),
      credentials: "include",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${session.access_token}`
      },
      method: "POST",
      redirect: "manual"
    });

    setPending(false);

    const result = (await response.json().catch(() => null)) as { error?: string; redirectTo?: string } | null;

    if (!response.ok) {
      setError(result?.error ?? "The project could not be created. Reload, confirm you are signed in, and try again.");
      return;
    }

    if (result?.redirectTo) {
      window.location.assign(result.redirectTo);
      return;
    }

    window.location.assign("/projects");
  }

  return (
    <form action="/projects/create" className="form-grid" method="post" onSubmit={submitProject}>
      {error ? <p className="setup-warning">{error}</p> : null}
      <div className="field">
        <label htmlFor="title">Project title</label>
        <input disabled={disabled || pending} id="title" name="title" required />
      </div>
      <div className="field">
        <label htmlFor="projectType">Project type</label>
        <select disabled={disabled || pending} id="projectType" name="projectType" defaultValue="theatre_production">
          <option value="theatre_production">Theatre production</option>
          <option value="campus_event">Campus event</option>
          <option value="rental">Rental</option>
          <option value="support_job">Support job</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="startsOn">Start date</label>
        <input disabled={disabled || pending} id="startsOn" name="startsOn" type="date" />
      </div>
      <div className="field">
        <label htmlFor="endsOn">End date</label>
        <input disabled={disabled || pending} id="endsOn" name="endsOn" type="date" />
      </div>
      <button disabled={disabled || pending} type="submit">
        {pending ? "Creating..." : "Create project"}
      </button>
    </form>
  );
}
