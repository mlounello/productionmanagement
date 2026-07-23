import "server-only";

export async function requestPlaybillOutboxDrain() {
  const url = process.env.PLAYBILL_OUTBOX_URL?.trim();
  const secret = process.env.PM_TO_PLAYBILL_INTEGRATION_SECRET?.trim();
  if (!url || !secret) {
    return { requested: false, reason: "not_configured" as const };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ source: "production_management" }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      console.error("Playbill outbox drain request failed", { status: response.status });
      return { requested: false, reason: "remote_error" as const };
    }
    return { requested: true as const };
  } catch (error) {
    console.error("Playbill outbox drain request failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { requested: false, reason: "network_error" as const };
  }
}
