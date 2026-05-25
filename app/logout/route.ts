import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.redirect(new URL("/projects", origin), { status: 303 });
}

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/login", origin), { status: 303 });
}
