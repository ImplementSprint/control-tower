import { NextResponse } from "next/server";
import { createClient } from "@/lib/server";

async function handleLogout(request: Request) {
  const url = new URL(request.url);
  const supabase = await createClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/auth/login", url.origin), { status: 303 });
}

export async function GET(request: Request) {
  return handleLogout(request);
}

export async function POST(request: Request) {
  return handleLogout(request);
}
