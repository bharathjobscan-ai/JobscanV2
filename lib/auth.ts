export const AUTH_COOKIE = "jobscan_session";

/**
 * Derive the session cookie value from the shared password (D3).
 *
 * The cookie holds a SHA-256 rather than the password itself, so a leaked
 * cookie does not hand over the secret in plain text. Web Crypto is used so the
 * same helper works in the proxy (edge) and in the server action.
 */
export async function sessionToken(password: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`jobscan:${password}`),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
