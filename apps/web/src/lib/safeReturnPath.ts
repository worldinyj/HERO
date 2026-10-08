/**
 * A return path is controlled by the browser URL query (next=), not by Auth.
 * Browsers interpret backslashes as slashes in special URLs. In particular
 * "/\\evil.example" can turn into an off-site URL despite starting with '/'.
 * Reject ambiguous paths before Supabase OAuth or local E2E redirects.
 */
const INTERNAL_ORIGIN = "https://hero-internal.invalid";

export function safeAppReturnPath(value: string | null | undefined): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    return "/";
  }

  // Encoded path separators/control characters are not useful as HERO routes
  // and can be interpreted differently by proxies and routers.
  const pathname = value.split(/[?#]/u, 1)[0] ?? "";
  if (/%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/iu.test(pathname)) {
    return "/";
  }

  try {
    const url = new URL(value, INTERNAL_ORIGIN);
    if (url.origin !== INTERNAL_ORIGIN) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
