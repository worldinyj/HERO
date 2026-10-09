/**
 * Constructs the only shareable form of a one-time invitation URL.
 * Configuration errors must be detected before invitation data is written.
 */
export function buildInviteUrl(siteUrl: string | undefined, token: string): string {
  if (!siteUrl?.trim()) {
    throw new Error("missing_site_url");
  }

  let base: URL;
  try {
    base = new URL(siteUrl.trim());
  } catch {
    throw new Error("invalid_site_url");
  }

  const localHttp =
    base.protocol === "http:" &&
    (base.hostname === "localhost" || base.hostname === "127.0.0.1" || base.hostname === "[::1]");
  const validTransport = base.protocol === "https:" || localHttp;

  if (
    !validTransport ||
    !base.hostname ||
    base.username ||
    base.password ||
    base.pathname !== "/" ||
    base.search ||
    base.hash
  ) {
    throw new Error("invalid_site_url");
  }

  return new URL(`/i/${encodeURIComponent(token)}`, base).toString();
}
