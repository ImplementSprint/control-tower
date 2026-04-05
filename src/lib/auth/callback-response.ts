import { NextResponse } from "next/server";

export function resolveSafeNextPath(rawNext: string | null) {
  if (!rawNext) {
    return "/";
  }

  if (!rawNext.startsWith("/") || rawNext.startsWith("//")) {
    return "/";
  }

  if (rawNext.startsWith("/auth/login") || rawNext.startsWith("/auth/callback")) {
    return "/";
  }

  return rawNext;
}

export function redirectWithSessionCookies(
  sessionResponse: NextResponse,
  redirectUrl: URL,
) {
  const redirectResponse = NextResponse.redirect(redirectUrl);

  for (const cookie of sessionResponse.cookies.getAll()) {
    const { name, value, ...options } = cookie;
    redirectResponse.cookies.set(name, value, {
      ...options,
      path: options.path ?? "/",
      sameSite: options.sameSite ?? "lax",
      httpOnly: options.httpOnly ?? true,
      secure: options.secure ?? process.env.NODE_ENV === "production",
    });
  }

  return redirectResponse;
}
