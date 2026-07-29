import "server-only";

import { THEATRE_BUDGET_SITE_URL } from "@/lib/config";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

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

export async function sendTheatreBudgetDepartmentAccessLink(input: {
  email: string;
  fullName: string;
}) {
  const email = normalizeEmail(input.email);
  if (!email) throw new Error("Add an email address to this person before sending Theatre Budget access.");
  const admin = createSupabaseAdminClient();
  const redirectTo = `${THEATRE_BUDGET_SITE_URL.replace(/\/+$/, "")}/auth/callback`;
  const existing = await findAuthUser(email);

  if (existing) {
    const { error: userError } = await admin
      .schema("app_theatre_budget")
      .from("users")
      .upsert({ id: existing.id, full_name: input.fullName || email }, { onConflict: "id" });
    if (userError) throw userError;
    const { error: activationError } = await admin.rpc("activate_pending_department_budget_access", {
      target_user_id: existing.id,
      target_email: email
    });
    if (activationError) throw activationError;
    const { error: linkError } = await admin.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo }
    });
    if (linkError) throw linkError;
    return { created: false };
  }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: input.fullName || email, name: input.fullName || email },
    redirectTo
  });
  if (error) throw error;
  if (!data.user?.id) throw new Error("The Theatre Budget account could not be created.");
  const { error: activationError } = await admin.rpc("activate_pending_department_budget_access", {
    target_user_id: data.user.id,
    target_email: email
  });
  if (activationError) throw activationError;
  return { created: true };
}
