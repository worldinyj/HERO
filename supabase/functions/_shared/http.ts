const LOCAL_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function allowedOrigin(req: Request): string {
  const origin = req.headers.get("origin") ?? "";
  const siteUrl = Deno.env.get("SITE_URL");

  if (LOCAL_ORIGINS.has(origin)) {
    return origin;
  }

  if (siteUrl) {
    try {
      if (origin === new URL(siteUrl).origin) {
        return origin;
      }
    } catch {
      // Deployment configuration is validated separately.
    }
  }

  return "null";
}

export function corsHeaders(req: Request): HeadersInit {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(req),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function handleOptions(req: Request): Response | null {
  if (req.method !== "OPTIONS") {
    return null;
  }

  return new Response(null, { status: 204, headers: corsHeaders(req) });
}
