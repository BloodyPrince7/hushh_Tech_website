import { google } from "googleapis";

const ANALYTICS_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const CACHE_TTL_MS = 60_000;

let realtimeCache = null;

function getLookerStudioEmbedUrl() {
  const rawUrl = process.env.LOOKER_STUDIO_EMBED_URL?.trim();
  return rawUrl || undefined;
}

function parseAllowedHostnames() {
  return (process.env.GA4_ALLOWED_HOSTNAMES || "")
    .split(",")
    .map((hostname) => hostname.trim())
    .filter(Boolean);
}

function getPropertyId() {
  const propertyId = process.env.GA4_PROPERTY_ID?.trim();

  if (!propertyId || !/^\d+$/.test(propertyId)) {
    throw new Error("GA4_PROPERTY_ID is not configured");
  }

  return propertyId;
}

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

  const firstRow = response.data.rows?.[0];
  const activeUsers = Number(firstRow?.metricValues?.[0]?.value || 0);
  const now = new Date().toISOString();

  return {
    activeUsers,
    generatedAt: now,
    stale: false,
    source: "ga4-data-api",
    windowMinutes: 30,
    refreshIntervalMs: CACHE_TTL_MS,
    lookerStudioEmbedUrl: getLookerStudioEmbedUrl(),
    note:
      allowedHostnames.length > 0
        ? `Realtime data is property-wide because the GA4 Realtime API does not support hostname filtering. Configured hostnames: ${allowedHostnames.join(", ")}.`
        : undefined,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "no-store");

  if (realtimeCache && Date.now() - realtimeCache.cachedAt < CACHE_TTL_MS) {
    return res.status(200).json(realtimeCache.payload);
  }

  try {
    const payload = await fetchRealtimeMetrics();
    realtimeCache = {
      cachedAt: Date.now(),
      payload,
    };

    return res.status(200).json(payload);
  } catch (error) {
    console.error("analytics realtime route error:", error);

    if (realtimeCache?.payload) {
      return res.status(200).json({
        ...realtimeCache.payload,
        stale: true,
        note:
          "Showing the most recent cached GA4 value because the live refresh failed.",
      });
    }

    return res.status(503).json({
      error: "Realtime analytics unavailable",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
