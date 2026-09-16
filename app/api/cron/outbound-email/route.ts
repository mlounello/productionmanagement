import { NextRequest, NextResponse } from "next/server";
import { deliverQueuedEmails } from "@/lib/outbound-email-queue";
export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 300;
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try { return NextResponse.json({ ok: true, results: await deliverQueuedEmails({ limit: 20 }) }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Email queue failed." }, { status: 500 }); }
}
