import { NextResponse } from "next/server";
import { hasIntegrationSecret } from "@/lib/integration-auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!hasIntegrationSecret(request, process.env.PLAYBILL_TO_PM_INTEGRATION_SECRET)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const worker = `production-management:${crypto.randomUUID()}`;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("process_playbill_publicity_events", {
    worker_name: worker,
    batch_limit: 20,
  });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const metrics = await admin.schema("core").rpc("capture_phase8_metrics");
  return NextResponse.json({
    ok: true,
    result: data,
    metrics: metrics.error ? null : metrics.data,
  });
}
