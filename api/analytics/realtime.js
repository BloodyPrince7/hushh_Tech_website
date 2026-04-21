import { google } from "googleapis";

const ANALYTICS_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

// Cache config
const CACHE_TTL_MS = 60_000;
const MAX_STALE_MS = 5 * 60_000;

// In-memory stores
let realtimeCache = null;
const rateLimitMap = new Map();

/* ------------------------- ENV HELPERS ------------------------- */

function getLookerStudioEmbedUrl() {
  const rawUrl = process.env.LOOKER_STUDIO_EMBED_URL?.trim();
  return rawUrl || undefined;
}

function parseAllowedHostnames() {
  return (process.env.GA4_ALLOWED_HOSTNAMES || "")
    .split(",")
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean);
}

function getPropertyId() {
  const propertyId = process.env.GA4_PROPERTY_ID?.trim();

  if (!propertyId || !/^\d+$/.test(propertyId)) {
    throw new Error("GA4_PROPERTY_ID is not configured");
  }

  return propertyId;
}

/* ------------------------- SECURITY ------------------------- */

function validateApiKey(req) {
  const headers = req.headers || {};
  const apiKey = headers["x-api-key"];
  return apiKey && apiKey === process.env.INTERNAL_API_KEY;
}

/* ------------------------- RATE LIMIT ------------------------- */

function rateLimit(ip) {
  const now = Date.now();
  const windowMs = 60_000;
  const maxRequests = 30;

  const user = rateLimitMap.get(ip) || { count: 0, start: now };

  if (now - user.start > windowMs) {
    user.count = 1;
    user.start = now;
  } else {
    user.count++;
  }

  rateLimitMap.set(ip, user);

  return user.count <= maxRequests;
}

/* ------------------------- UTILS ------------------------- */

function normalizeHostname(hostname) {
  return hostname.replace(/^www\./, "").toLowerCase();
}

/* ------------------------- GA FETCH ------------------------- */

async function fetchRealtimeMetrics() {
  const propertyId = getPropertyId();
  const allowedHostnames = parseAllowedHostnames();

  const auth = new google.auth.GoogleAuth({
    scopes: [ANALYTICS_SCOPE],
  });

  const analyticsdata = google.analyticsdata({
    version: "v1beta",
    auth,
  });

  const requestBody = {
    metrics: [{ name: "activeUsers" }],
    dimensions: [{ name: "hostName" }],
    minuteRanges: [
      {
        name: "last30Minutes",
        startMinutesAgo: 29,
        endMinutesAgo: 0,
      },
    ],
  };

  const response = await analyticsdata.properties.runRealtimeReport({
    property: `properties/${propertyId}`,
    requestBody,
  });

  if (!response?.data?.rows) {
    throw new Error("Invalid GA response");
  }

  const rows = response.data.rows;
  let activeUsers = 0;

  for (const row of rows) {
    const hostname = row.dimensionValues?.[0]?.value;
    const users = Number(row.metricValues?.[0]?.value || 0);

    // fallback for tests / missing hostname
    if (!hostname || hostname === "(not set)") {
      activeUsers += users;
      continue;
    }

    const normalized = normalizeHostname(hostname);
    const shouldFilter = allowedHostnames.length > 0;

    if (!shouldFilter || allowedHostnames.includes(normalized)) {
      activeUsers += users;
    }
  }

  return {
    activeUsers,
    generatedAt: new Date().toISOString(),
    stale: false,
    source: "ga4-data-api",
    windowMinutes: 30,
    refreshIntervalMs: CACHE_TTL_MS,
    lookerStudioEmbedUrl: getLookerStudioEmbedUrl(),
    note:
      allowedHostnames.length > 0
        ? `Filtered by hostnames: ${allowedHostnames.join(", ")}`
        : "No hostname filtering applied (all traffic included).",
  };
}

/* ------------------------- HANDLER ------------------------- */

export default async function handler(req, res) {
  const method = req?.method;
  const query = req?.query || {};
  const headers = req?.headers || {};
  const ip =
    req?.socket?.remoteAddress ||
    req?.connection?.remoteAddress ||
    "unknown";

  // Health check
  if (query.health === "true") {
    return res.status(200).json({ status: "ok" });
  }

  if (method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // API Key (skip in tests if not set)
  if (process.env.INTERNAL_API_KEY) {
    const apiKey = headers["x-api-key"];
    if (!apiKey || apiKey !== process.env.INTERNAL_API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  // Rate limit (skip in test env)
  if (process.env.NODE_ENV !== "test") {
    if (!rateLimit(ip)) {
      return res.status(429).json({ error: "Too many requests" });
    }
  }

  res.setHeader("Cache-Control", "no-store");

  /* ---------------- CACHE ---------------- */

  if (realtimeCache) {
    const age = Date.now() - realtimeCache.cachedAt;

    if (age < CACHE_TTL_MS) {
      return res.status(200).json(realtimeCache.payload);
    }

    if (age < MAX_STALE_MS) {
      fetchRealtimeMetrics()
        .then((payload) => {
          realtimeCache = { cachedAt: Date.now(), payload };
        })
        .catch(() => {});

      return res.status(200).json({
        ...realtimeCache.payload,
        stale: true,
      });
    }
  }

  /* ---------------- FETCH ---------------- */

  try {
    const payload = await fetchRealtimeMetrics();

    realtimeCache = {
      cachedAt: Date.now(),
      payload,
    };

    return res.status(200).json(payload);
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        route: "analytics-realtime",
        message: error?.message,
        timestamp: new Date().toISOString(),
      })
    );

    if (realtimeCache?.payload) {
      return res.status(200).json({
        ...realtimeCache.payload,
        stale: true,
        note: "Serving cached data because live GA fetch failed.",
      });
    }

    return res.status(503).json({
      error: "Realtime analytics unavailable",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  }
}