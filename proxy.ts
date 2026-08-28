import { NextResponse, type NextRequest } from "next/server";

import { AUTH_COOKIE, sessionToken } from "@/lib/auth";

/**
 * Single-password gate (D3).
 *
 * The app is deployed to a public Vercel URL and holds personal job-search
 * data, so it must not be world-readable.
 *
 * With APP_PASSWORD unset the gate is skipped — convenient locally, which is
 * why the deployment checklist marks it required on Vercel.
 */
export async function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/login")) return NextResponse.next();

  const cookie = request.cookies.get(AUTH_COOKIE)?.value;
  if (cookie && cookie === (await sessionToken(password))) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
