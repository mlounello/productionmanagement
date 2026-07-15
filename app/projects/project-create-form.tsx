"use client";

import { useState, type FormEvent } from "react";
import {
  DepartmentSelector,
  LocationSelector,
  ReferenceValueSelector
} from "@/components/reference-selectors";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { DepartmentOption, LocationOption, ReferenceValueOption } from "@/lib/reference-data";

export function ProjectCreateForm({
  departments,
  disabled,
  locations,
  projectTypes
}: {
  departments: DepartmentOption[];
  disabled: boolean;
  locations: LocationOption[];
  projectTypes: ReferenceValueOption[];
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    setError("");
    setPending(true);

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
      body: formData,
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
      <ReferenceValueSelector
        disabled={disabled || pending}
        label="Project type"
        name="projectType"
        options={projectTypes}
        placeholder="Select project type"
        required
        selectId="projectType"
      />
      <DepartmentSelector
        departments={departments}
        disabled={disabled || pending}
        label="Primary department"
        name="departmentId"
        selectId="departmentId"
      />
      <LocationSelector
        disabled={disabled || pending}
        label="Primary location"
        locations={locations}
        name="locationId"
        selectId="locationId"
      />
      <div className="field">
        <label htmlFor="startsOn">Start date</label>
        <input disabled={disabled || pending} id="startsOn" name="startsOn" type="date" />
      </div>
      <div className="field">
        <label htmlFor="endsOn">End date</label>
        <input disabled={disabled || pending} id="endsOn" name="endsOn" type="date" />
      </div>
      <button disabled={disabled || pending} type="submit">
        {pending ? "Creating..." : "Create & configure project"}
      </button>
    </form>
  );
}
