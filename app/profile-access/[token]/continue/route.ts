import { NextResponse } from "next/server";
import { consumeProfileAccessLink } from "@/lib/profile-access-links";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    return NextResponse.redirect(await consumeProfileAccessLink(token), { status: 303 });
  } catch (error) {
    const url = new URL(`/profile-access/${encodeURIComponent(token)}`, request.url);
    url.searchParams.set("error", error instanceof Error ? error.message : "Secure access could not be opened.");
    return NextResponse.redirect(url, { status: 303 });
  }
}
