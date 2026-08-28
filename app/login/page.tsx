import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { buttonClass, inputClass } from "@/components/ui/base";
import { AUTH_COOKIE, sessionToken } from "@/lib/auth";

async function signIn(formData: FormData) {
  "use server";

  const password = process.env.APP_PASSWORD;
  const submitted = formData.get("password");
  const next = formData.get("next");

  if (!password || typeof submitted !== "string" || submitted !== password) {
    redirect("/login?error=1");
  }

  const store = await cookies();
  store.set(AUTH_COOKIE, await sessionToken(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect(typeof next === "string" && next.startsWith("/") ? next : "/applications");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <form
        action={signIn}
        className="w-full max-w-xs rounded-lg border border-line bg-surface p-5"
      >
        <h1 className="text-sm font-semibold">JobScan</h1>
        <p className="mt-1 mb-4 text-xs text-muted">
          Enter the access password to continue.
        </p>

        <input type="hidden" name="next" value={params.next ?? "/applications"} />
        <input
          type="password"
          name="password"
          autoFocus
          required
          placeholder="Password"
          className={inputClass}
        />

        {params.error ? (
          <p className="mt-2 text-xs text-negative">Incorrect password.</p>
        ) : null}

        <button type="submit" className={`${buttonClass.primary} mt-3 w-full`}>
          Sign in
        </button>
      </form>
    </main>
  );
}
