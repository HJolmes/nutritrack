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
const DECODER_TIMEOUT_MS = 1500;

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

// Validates EAN-13 / EAN-8 / UPC-A check digit (last digit).
// Returns true for codes with a correct check digit, false otherwise.
// Strong filter against hallucinated digits from the vision model.
function isValidBarcodeChecksum(code) {
  if (typeof code !== "string" || !/^\d+$/.test(code)) return false;
  if (code.length !== 13 && code.length !== 12 && code.length !== 8) {
    // We cannot validate Code 128 / Code 39 / unusual lengths cheaply – allow them through.
    return true;
  }
  // EAN-13 / UPC-A use the same checksum algorithm; pad UPC-A (12) to 13 with leading 0.
  const padded = code.length === 12 ? "0" + code : code;
  if (padded.length === 13) {
    let sumOdd = 0;
    let sumEven = 0;
    for (let i = 0; i < 12; i++) {
      const d = padded.charCodeAt(i) - 48;
      if (i % 2 === 0) sumOdd += d;
      else sumEven += d;
    }
    const total = sumOdd + sumEven * 3;
    const expected = (10 - (total % 10)) % 10;
    return expected === padded.charCodeAt(12) - 48;
  }
  if (code.length === 8) {
    // EAN-8: positions 1,3,5,7 ×3 + positions 2,4,6 ×1 (0-indexed inverted).
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      const d = code.charCodeAt(i) - 48;
      sum += i % 2 === 0 ? d * 3 : d;
    }
    const expected = (10 - (sum % 10)) % 10;
    return expected === code.charCodeAt(7) - 48;
  }
  return true;
}

// Calls the OSS-Decoder microservice (OpenCV BarcodeDetector + pyzbar) and
// returns the parsed JSON or null on any error / timeout.
async function tryExternalDecoder(decoderUrl, buffer, mediaType) {
  try {
    const response = await fetch(decoderUrl.replace(/\/+$/, "") + "/decode", {
      method: "POST",
      headers: { "Content-Type": mediaType },
      body: buffer,
      signal: AbortSignal.timeout(DECODER_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    return null;
  }
}

async function handleDecodeBarcode(request, origin, env) {
  if (origin && !allowedOrigins(env).has(origin)) {
    return jsonResponse(403, "origin_not_allowed", "Origin is not allowed", origin, env);
  }
  const visionFallbackEnabled = env.ENABLE_VISION_FALLBACK === "true";
  if (!env.NUTRITRACK_PROXY_TOKEN) {
    return jsonResponse(500, "worker_not_configured", "Required Worker secrets are missing", origin, env);
  }
  if (visionFallbackEnabled && !env.ANTHROPIC_API_KEY) {
    return jsonResponse(500, "worker_not_configured", "ANTHROPIC_API_KEY is required when ENABLE_VISION_FALLBACK is true", origin, env);
  }
  if (!env.DECODER_URL && !visionFallbackEnabled) {
    return jsonResponse(500, "worker_not_configured", "DECODER_URL or ENABLE_VISION_FALLBACK must be set", origin, env);
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

  // Primary path: OSS-Decoder (OpenCV + pyzbar). Skips Anthropic entirely on hit.
  if (env.DECODER_URL) {
    const decoded = await tryExternalDecoder(env.DECODER_URL, buffer, mediaType);
    const decodedCode = decoded && typeof decoded.code === "string" ? decoded.code : null;
    if (decodedCode && isValidBarcodeChecksum(decodedCode)) {
      return jsonResponse(200, "ok", "ok", origin, env, {
        code: decodedCode,
        raw: decodedCode,
        candidate: decodedCode,
        checksumValid: true,
        found: true,
        source: "opencv",
      });
    }
  }

  // Fallback path is opt-in. Without it, we return a clean miss so the client
  // can fall back to its local decoders / manual entry without paying for Vision.
  if (!visionFallbackEnabled) {
    return jsonResponse(200, "ok", "ok", origin, env, {
      code: null,
      raw: "",
      candidate: null,
      checksumValid: false,
      found: false,
      source: "opencv-miss",
    });
  }

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
            text: "Read the EAN-13 barcode in this image. Below the black bars there is a row of 13 digits printed in plain text. Reply with ONLY those 13 digits, no spaces, no other text. If you cannot clearly read all 13 digits, reply exactly NONE. Do NOT guess any digit. Do NOT invent digits. NONE is the right answer when the barcode is blurry, partially occluded, or not in the image.",
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
  const candidate = extractBarcodeDigits(text);
  const rawTrimmed = (text || "").trim().slice(0, 64);
  const checksumValid = candidate ? isValidBarcodeChecksum(candidate) : false;
  const code = checksumValid ? candidate : null;

  return jsonResponse(200, "ok", "ok", origin, env, {
    code: code,
    raw: rawTrimmed,
    candidate: candidate,
    checksumValid: checksumValid,
    found: Boolean(code),
    source: "anthropic",
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
        decoderConfigured: Boolean(env.DECODER_URL),
        visionFallbackEnabled: env.ENABLE_VISION_FALLBACK === "true",
        codeVersion: "v0.137-decoder-first",
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
