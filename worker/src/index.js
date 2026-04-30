const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_ALLOWED_ORIGINS = [
  "https://hjolmes.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
  "http://localhost:8787",
  "http://127.0.0.1:8787",
];
const MAX_BODY_BYTES = 1024 * 1024 * 4;
const MAX_BARCODE_BODY_BYTES = 1024 * 200; // 200 KB pro Frame reicht
const BARCODE_MODEL = "claude-haiku-4-5";

function allowedOrigins(env) {
  const raw = env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(",");
  return new Set(raw.split(",").map((origin) => origin.trim()).filter(Boolean));
}

function corsHeaders(origin, env) {
  const origins = allowedOrigins(env);
  const fallbackOrigin = origins.values().next().value || "https://hjolmes.github.io";
  const allowedOrigin = origins.has(origin) ? origin : fallbackOrigin;
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-app-proxy-secret",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(status, code, message, origin, env, details) {
  const payload = {
    ok: status >= 200 && status < 300,
    error: status >= 400 ? { code, message } : undefined,
    data: status < 400 ? details || null : undefined,
  };
  if (status >= 400 && details) payload.error.details = details;
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(origin, env),
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

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function extractBarcodeDigits(text) {
  if (typeof text !== "string") return null;
  const cleaned = text.trim().toUpperCase();
  if (cleaned === "NONE" || cleaned === "" || cleaned.includes("NONE")) return null;
  const digits = cleaned.replace(/\D/g, "");
  // EAN-13, EAN-8, UPC-A (12), UPC-E (8), Code128/39 typ. 8-14
  if (digits.length < 8 || digits.length > 14) return null;
  return digits;
}

async function handleDecodeBarcode(request, origin, env) {
  if (origin && !allowedOrigins(env).has(origin)) {
    return jsonResponse(403, "origin_not_allowed", "Origin is not allowed", origin, env);
  }
  if (!env.ANTHROPIC_API_KEY || !env.NUTRITRACK_PROXY_TOKEN) {
    return jsonResponse(500, "worker_not_configured", "Required Worker secrets are missing", origin, env);
  }
  const token = request.headers.get("x-app-proxy-secret") || "";
  if (token !== env.NUTRITRACK_PROXY_TOKEN) {
    return jsonResponse(401, "unauthorized", "Invalid app proxy secret", origin, env);
  }
  if (getContentLength(request) > MAX_BARCODE_BODY_BYTES) {
    return jsonResponse(413, "request_too_large", "Frame is too large", origin, env);
  }

  let buffer;
  try {
    buffer = new Uint8Array(await request.arrayBuffer());
  } catch (error) {
    return jsonResponse(400, "invalid_body", "Frame body could not be read", origin, env);
  }
  if (!buffer.length || buffer.length > MAX_BARCODE_BODY_BYTES) {
    return jsonResponse(400, "invalid_body", "Frame body is empty or too large", origin, env);
  }

  const contentType = request.headers.get("content-type") || "image/jpeg";
  const mediaType = contentType.split(";")[0].trim() || "image/jpeg";
  const base64 = bytesToBase64(buffer);

  const body = {
    model: BARCODE_MODEL,
    max_tokens: 32,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          {
            type: "text",
            text: "Read the barcode in this image. Reply with ONLY the numeric code (the digits printed below the bars), no spaces, no other text. If no barcode is fully visible or readable, reply NONE.",
          },
        ],
      },
    ],
  };

  let upstream;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": env.ANTHROPIC_VERSION || DEFAULT_ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    return jsonResponse(502, "upstream_error", "Failed to reach Anthropic", origin, env);
  }
  if (!upstream.ok) {
    return jsonResponse(upstream.status, "upstream_error", "Anthropic returned an error", origin, env);
  }

  let answer;
  try {
    answer = await upstream.json();
  } catch (error) {
    return jsonResponse(502, "upstream_error", "Anthropic returned invalid JSON", origin, env);
  }
  const block = (answer && answer.content && answer.content[0]) || null;
  const text = block && block.type === "text" ? block.text : "";
  const code = extractBarcodeDigits(text);
  const rawTrimmed = (text || "").trim().slice(0, 64);

  return jsonResponse(200, "ok", "ok", origin, env, {
    code: code,
    raw: rawTrimmed,
    found: Boolean(code),
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse(200, "ok", "ok", origin, env, {
        service: "nutritrack-ai-proxy",
        configured: Boolean(env.ANTHROPIC_API_KEY && env.NUTRITRACK_PROXY_TOKEN),
      });
    }

    if (request.method === "POST" && url.pathname === "/decode-barcode") {
      return handleDecodeBarcode(request, origin, env);
    }

    if (request.method !== "POST" || url.pathname !== "/v1/messages") {
      return jsonResponse(404, "not_found", "Endpoint not found", origin, env);
    }

    if (origin && !allowedOrigins(env).has(origin)) {
      return jsonResponse(403, "origin_not_allowed", "Origin is not allowed", origin, env);
    }

    if (!env.ANTHROPIC_API_KEY || !env.NUTRITRACK_PROXY_TOKEN) {
      return jsonResponse(500, "worker_not_configured", "Required Worker secrets are missing", origin, env);
    }

    const token = request.headers.get("x-app-proxy-secret") || "";
    if (token !== env.NUTRITRACK_PROXY_TOKEN) {
      return jsonResponse(401, "unauthorized", "Invalid app proxy secret", origin, env);
    }

    if (getContentLength(request) > MAX_BODY_BYTES) {
      return jsonResponse(413, "request_too_large", "Request body is too large", origin, env);
    }

    let payload;
    try {
      payload = await request.json();
    } catch (error) {
      return jsonResponse(400, "invalid_json", "Request body must be valid JSON", origin, env);
    }

    const anthropicResponse = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": env.ANTHROPIC_VERSION || DEFAULT_ANTHROPIC_VERSION,
      },
      body: JSON.stringify(payload),
    });

    return new Response(anthropicResponse.body, {
      status: anthropicResponse.status,
      headers: {
        ...corsHeaders(origin, env),
        "Content-Type": anthropicResponse.headers.get("Content-Type") || "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  },
};
