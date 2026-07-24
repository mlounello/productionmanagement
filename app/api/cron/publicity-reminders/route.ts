import { NextRequest, NextResponse } from "next/server";
import { runAutomaticPublicityReminders } from "@/lib/publicity-reminder-automation";
import { runPublicitySyncReconciliation } from "@/lib/publicity-sync-reconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const publicitySync = await runPublicitySyncReconciliation();
    const reminders = await runAutomaticPublicityReminders();
    return NextResponse.json({ ok: true, publicitySync, reminders });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Automatic publicity reminders failed."
    }, { status: 500 });
  }
}
