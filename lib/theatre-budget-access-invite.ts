import "server-only";

import { THEATRE_BUDGET_SITE_URL } from "@/lib/config";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { elevatedSupabaseConfiguration } from "@/lib/supabase-admin-config";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

async function findAuthUser(email: string) {
  const admin = createSupabaseAdminClient();
  const target = normalizeEmail(email);
  const perPage = 1000;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((user) => normalizeEmail(user.email ?? "") === target);
    if (found) return found;
    if (data.users.length < perPage) return null;
  }
  return null;
}

async function requestTheatreBudgetAccessEmail(email: string) {
  const { key } = elevatedSupabaseConfiguration(process.env);
  const response = await fetch(
    `${THEATRE_BUDGET_SITE_URL.replace(/\/+$/, "")}/api/integrations/production-management/budget-access-link`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email }),
      cache: "no-store"
    }
  );
  if (response.ok) return;
  const payload = await response.json().catch(() => ({})) as { error?: string };
  throw new Error(payload.error || `Theatre Budget email delivery failed (${response.status}).`);
}

export async function sendTheatreBudgetDepartmentAccessLink(input: {
  email: string;
  fullName: string;
}) {
  const email = normalizeEmail(input.email);
  if (!email) throw new Error("Add an email address to this person before sending Theatre Budget access.");
  const admin = createSupabaseAdminClient();
  let account = await findAuthUser(email);
  const created = !account;

  if (!account) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: input.fullName || email, name: input.fullName || email }
    });
    if (error) throw error;
    if (!data.user?.id) throw new Error("The Theatre Budget account could not be created.");
    account = data.user;
  }

  const { error: userError } = await admin
    .schema("app_theatre_budget")
    .from("users")
    .upsert({ id: account.id, full_name: input.fullName || email }, { onConflict: "id" });
  if (userError) throw userError;
  const { error: activationError } = await admin.rpc("activate_pending_department_budget_access", {
    target_user_id: account.id,
    target_email: email
  });
  if (activationError) throw activationError;
  await requestTheatreBudgetAccessEmail(email);
  return { created };
}
