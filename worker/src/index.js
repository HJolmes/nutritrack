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

// ─── SHARE-LINK SHORTENER (KV-backed) ───
const SHARE_ID_LEN = 7;
const SHARE_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year
const MAX_SHARE_CODE_BYTES = 1024 * 8; // 8 KB; recipes ~600 chars
const SHARE_TARGET_BASE = "https://hjolmes.github.io/nutritrack/";
// Base58-ish (no 0/O/1/I/l) – avoids visual confusion in shared URLs
const SHARE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";

function generateShareId() {
  const arr = new Uint8Array(SHARE_ID_LEN);
  crypto.getRandomValues(arr);
  let id = "";
  for (let i = 0; i < SHARE_ID_LEN; i++) id += SHARE_ALPHABET[arr[i] % SHARE_ALPHABET.length];
  return id;
}

async function handleShareCreate(request, origin, env) {
  if (origin && !allowedOrigins(env).has(origin)) {
    return jsonResponse(403, "origin_not_allowed", "Origin is not allowed", origin, env);
  }
  if (!env.SHARE_KV) {
    return jsonResponse(503, "kv_not_configured", "Share storage is not configured", origin, env);
  }
  if (getContentLength(request) > MAX_SHARE_CODE_BYTES) {
    return jsonResponse(413, "request_too_large", "Code is too large", origin, env);
  }
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse(400, "invalid_json", "Body must be JSON", origin, env);
  }
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code || code.length < 8 || code.length > 8192 || !/^[A-Za-z0-9+/=_-]+$/.test(code)) {
    return jsonResponse(400, "invalid_code", "Invalid share code", origin, env);
  }
  let id = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateShareId();
    const exists = await env.SHARE_KV.get(candidate);
    if (!exists) { id = candidate; break; }
  }
  if (!id) {
    return jsonResponse(500, "id_collision", "Could not generate unique ID", origin, env);
  }
  await env.SHARE_KV.put(id, code, { expirationTtl: SHARE_TTL_SECONDS });
  // Short URL on PWA origin so Android Chrome's handle_links can route
  // installed-PWA links directly to the app instead of the browser tab.
  return jsonResponse(200, "ok", "ok", origin, env, {
    id,
    short: SHARE_TARGET_BASE + "?s=" + id,
  });
}

async function handleShareLookup(request, origin, env) {
  if (origin && !allowedOrigins(env).has(origin)) {
    return jsonResponse(403, "origin_not_allowed", "Origin is not allowed", origin, env);
  }
  if (!env.SHARE_KV) {
    return jsonResponse(503, "kv_not_configured", "Share storage is not configured", origin, env);
  }
  const url = new URL(request.url);
  const id = url.pathname.replace(/^\/share\//, "").trim();
  if (!id || !/^[A-Za-z0-9]{4,16}$/.test(id)) {
    return jsonResponse(400, "invalid_id", "Invalid share id", origin, env);
  }
  const code = await env.SHARE_KV.get(id);
  if (!code) {
    return jsonResponse(404, "not_found", "Share link expired or not found", origin, env);
  }
  return jsonResponse(200, "ok", "ok", origin, env, { id, code });
}

// ─── FEEDBACK ENDPOINT (creates GitHub Issue, optional screenshot upload) ───
const MAX_FEEDBACK_BODY_BYTES = 1024 * 1024 * 1.5; // 1.5 MB total incl. screenshot
const MAX_FEEDBACK_DESCRIPTION = 2000;
const MAX_FEEDBACK_SCREENSHOT_BYTES = 1024 * 1024; // 1 MB raw base64
const FEEDBACK_SCREENSHOT_BRANCH = "feedback-screenshots";
const FEEDBACK_USER_AGENT = "nutritrack-feedback-worker";
const FEEDBACK_DEFAULT_REPO = "hjolmes/nutritrack";

function ghHeaders(env) {
  return {
    Authorization: "Bearer " + env.GITHUB_TOKEN,
    Accept: "application/vnd.github+json",
    "User-Agent": FEEDBACK_USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function ensureFeedbackBranch(env, repo) {
  let res = await fetch(`https://api.github.com/repos/${repo}/branches/${FEEDBACK_SCREENSHOT_BRANCH}`, {
    headers: ghHeaders(env),
  });
  if (res.ok) return true;
  if (res.status !== 404) return false;
  res = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/main`, {
    headers: ghHeaders(env),
  });
  if (!res.ok) return false;
  const mainRef = await res.json();
  const sha = mainRef && mainRef.object && mainRef.object.sha;
  if (!sha) return false;
  res = await fetch(`https://api.github.com/repos/${repo}/git/refs`, {
    method: "POST",
    headers: { ...ghHeaders(env), "Content-Type": "application/json" },
    body: JSON.stringify({ ref: `refs/heads/${FEEDBACK_SCREENSHOT_BRANCH}`, sha }),
  });
  return res.ok || res.status === 422; // 422 = ref already exists (race)
}

async function uploadFeedbackScreenshot(env, repo, base64) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `feedback/screenshots/${ts}-${rand}.jpg`;
  const branchOk = await ensureFeedbackBranch(env, repo);
  if (!branchOk) return null;
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: "PUT",
    headers: { ...ghHeaders(env), "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `feedback: screenshot ${ts}`,
      branch: FEEDBACK_SCREENSHOT_BRANCH,
      content: base64,
    }),
  });
  if (!res.ok) return null;
  const j = await res.json();
  return (j && j.content && j.content.download_url) || null;
}

function mdEscapeCell(s) {
  return String(s == null ? "" : s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ").slice(0, 240);
}

async function handleFeedback(request, origin, env) {
  if (origin && !allowedOrigins(env).has(origin)) {
    return jsonResponse(403, "origin_not_allowed", "Origin is not allowed", origin, env);
  }
  if (!env.GITHUB_TOKEN) {
    return jsonResponse(503, "github_not_configured", "Feedback endpoint is not configured", origin, env);
  }
  const repo = ((env.GITHUB_REPO || FEEDBACK_DEFAULT_REPO) + "").trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    return jsonResponse(500, "github_repo_invalid", "GITHUB_REPO is invalid", origin, env);
  }
  if (getContentLength(request) > MAX_FEEDBACK_BODY_BYTES) {
    return jsonResponse(413, "request_too_large", "Feedback is too large", origin, env);
  }
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse(400, "invalid_json", "Body must be JSON", origin, env);
  }
  const type = body && (body.type === "bug" || body.type === "enhancement") ? body.type : null;
  if (!type) {
    return jsonResponse(400, "invalid_type", "type must be 'bug' or 'enhancement'", origin, env);
  }
  const description = body && typeof body.description === "string" ? body.description.trim() : "";
  if (!description) {
    return jsonResponse(400, "missing_description", "description is required", origin, env);
  }
  if (description.length > MAX_FEEDBACK_DESCRIPTION) {
    return jsonResponse(400, "description_too_long", `description max ${MAX_FEEDBACK_DESCRIPTION} chars`, origin, env);
  }
  const ctx = body && body.context && typeof body.context === "object" ? body.context : {};
  let screenshotB64 = body && typeof body.screenshotB64 === "string" ? body.screenshotB64 : null;
  if (screenshotB64) {
    // Strip a possible data:image/...;base64, prefix defensively
    const comma = screenshotB64.indexOf(",");
    if (comma > 0 && /^data:/i.test(screenshotB64)) screenshotB64 = screenshotB64.slice(comma + 1);
    if (!/^[A-Za-z0-9+/=]+$/.test(screenshotB64)) {
      return jsonResponse(400, "invalid_screenshot", "Screenshot must be base64", origin, env);
    }
    if (screenshotB64.length > MAX_FEEDBACK_SCREENSHOT_BYTES) {
      return jsonResponse(413, "screenshot_too_large", "Screenshot is too large", origin, env);
    }
  }

  let screenshotUrl = null;
  let screenshotError = null;
  if (screenshotB64) {
    try {
      screenshotUrl = await uploadFeedbackScreenshot(env, repo, screenshotB64);
      if (!screenshotUrl) screenshotError = "upload returned no URL";
    } catch (e) {
      screenshotError = (e && e.message) || "upload threw";
    }
  }

  const isBug = type === "bug";
  const labels = [isBug ? "bug" : "enhancement", "from-app"];
  const titlePrefix = isBug ? "[Bug]" : "[Idee]";
  const firstLine = description.split("\n")[0].trim().slice(0, 70) || description.slice(0, 70);
  const title = `${titlePrefix} ${firstLine}`;

  const md = [
    `**Typ:** ${isBug ? "🐛 Bug" : "💡 Änderungswunsch"}`,
    "",
    "### Beschreibung",
    description,
    "",
    "### Kontext",
    "| Feld | Wert |",
    "|---|---|",
    `| Tab | \`${mdEscapeCell(ctx.tab || "?")}\` |`,
    `| Screen | \`${mdEscapeCell(ctx.screen || "?")}\` |`,
    `| App-Version | \`${mdEscapeCell(ctx.version || "?")}\` |`,
    `| Standalone (PWA) | ${ctx.standalone ? "ja" : "nein"} |`,
    `| Online | ${ctx.online === false ? "nein" : "ja"} |`,
    `| Zeitpunkt | ${mdEscapeCell(ctx.ts || "")} |`,
    `| User-Agent | \`${mdEscapeCell(ctx.ua || "")}\` |`,
    "",
  ];
  if (screenshotUrl) {
    md.push("### Screenshot");
    md.push(`![Screenshot](${screenshotUrl})`);
    md.push("");
  } else if (screenshotB64) {
    md.push(`> _(Screenshot wurde mitgeschickt, konnte aber nicht hochgeladen werden${screenshotError ? ": " + screenshotError : ""}.)_`);
    md.push("");
  }
  md.push("---");
  md.push("_Gesendet via 🐛-Button in der NutriTrack-PWA._");

  const issueRes = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: { ...ghHeaders(env), "Content-Type": "application/json" },
    body: JSON.stringify({ title, body: md.join("\n"), labels }),
  });
  if (!issueRes.ok) {
    let detail = null;
    try {
      detail = await issueRes.json();
    } catch (_) {}
    return jsonResponse(502, "github_create_failed", `GitHub returned ${issueRes.status}`, origin, env, detail);
  }
  const issue = await issueRes.json();
  return jsonResponse(200, "ok", "ok", origin, env, {
    number: issue.number,
    html_url: issue.html_url,
    screenshotUploaded: Boolean(screenshotUrl),
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function handleShareRedirect(request, env) {
  // Legacy endpoint for v0.140 short URLs that pointed at the worker origin.
  // We now route to the PWA-origin short form so Android Chrome can deep-link
  // into an installed PWA via handle_links.
  const url = new URL(request.url);
  const id = url.pathname.replace(/^\/s\//, "").trim();
  if (!id || !/^[A-Za-z0-9]{4,16}$/.test(id)) {
    return new Response("Invalid share link", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  // Don't even hit KV — the PWA will look up the code itself and report a clean
  // error if the id is gone. This keeps the redirect cheap and works even when
  // SHARE_KV is unbound (e.g., during initial setup).
  const target = SHARE_TARGET_BASE + "?s=" + encodeURIComponent(id);
  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>NutriTrack</title><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0; url=${escapeHtml(target)}"><script>location.replace(${JSON.stringify(target)});</script><style>body{font-family:-apple-system,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;color:#2d7d52;background:#f5fbf7;}a{color:#2d7d52;}</style></head><body><div style="text-align:center;padding:24px;"><div style="font-size:42px;">📥</div><div style="margin-top:8px;font-weight:700;">Weiterleitung zu NutriTrack…</div><div style="margin-top:8px;font-size:13px;"><a href="${escapeHtml(target)}">Falls die Weiterleitung nicht funktioniert: tippe hier</a></div></div></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
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
        shareConfigured: Boolean(env.SHARE_KV),
        feedbackConfigured: Boolean(env.GITHUB_TOKEN),
        codeVersion: "v0.145-feedback",
      });
    }

    if (request.method === "POST" && url.pathname === "/decode-barcode") {
      return handleDecodeBarcode(request, origin, env);
    }

    if (request.method === "POST" && url.pathname === "/share") {
      return handleShareCreate(request, origin, env);
    }
    if (request.method === "POST" && url.pathname === "/feedback") {
      return handleFeedback(request, origin, env);
    }
    if (request.method === "GET" && url.pathname.startsWith("/share/")) {
      return handleShareLookup(request, origin, env);
    }
    if (request.method === "GET" && url.pathname.startsWith("/s/")) {
      return handleShareRedirect(request, env);
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
