const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const ALLOWED_ORIGINS = new Set([
  "https://hjolmes.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
  "http://localhost:8787",
  "http://127.0.0.1:8787",
]);
const MAX_BODY_BYTES = 1024 * 1024 * 4;

function corsHeaders(origin) {
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://hjolmes.github.io";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-NutriTrack-Proxy-Token",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function getContentLength(request) {
  const raw = request.headers.get("content-length");
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== "POST" || url.pathname !== "/v1/messages") {
      return jsonResponse({ error: "not_found" }, 404, origin);
    }

    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return jsonResponse({ error: "origin_not_allowed" }, 403, origin);
    }

    if (!env.ANTHROPIC_API_KEY || !env.NUTRITRACK_PROXY_TOKEN) {
      return jsonResponse({ error: "worker_not_configured" }, 500, origin);
    }

    const token = request.headers.get("X-NutriTrack-Proxy-Token") || "";
    if (token !== env.NUTRITRACK_PROXY_TOKEN) {
      return jsonResponse({ error: "unauthorized" }, 401, origin);
    }

    if (getContentLength(request) > MAX_BODY_BYTES) {
      return jsonResponse({ error: "request_too_large" }, 413, origin);
    }

    let payload;
    try {
      payload = await request.json();
    } catch (error) {
      return jsonResponse({ error: "invalid_json" }, 400, origin);
    }

    const anthropicResponse = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(payload),
    });

    return new Response(anthropicResponse.body, {
      status: anthropicResponse.status,
      headers: {
        ...corsHeaders(origin),
        "Content-Type": anthropicResponse.headers.get("Content-Type") || "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  },
};
