import { buildMetricsSummary, clampWindowDays } from "./service.js";

const CACHE_TTL_MS = 5 * 60_000;
const summaryCache = new Map();

export function __resetMetricsSummaryCache() {
  summaryCache.clear();
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const windowDays = clampWindowDays(req.query?.window_days);
  const cacheKey = `window:${windowDays}`;
  const now = Date.now();
  const cached = summaryCache.get(cacheKey);

  res.setHeader("Cache-Control", "no-store");

  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return res.status(200).json(cached.payload);
  }

  try {
    const payload = await buildMetricsSummary({
      windowDays,
    });

    summaryCache.set(cacheKey, {
      cachedAt: now,
      payload,
    });

    return res.status(200).json(payload);
  } catch (error) {
    console.error("metrics summary route error:", error);

    if (cached?.payload) {
      return res.status(200).json({
        ...cached.payload,
        stale: true,
        dataQualityWarnings: [
          ...new Set([
            ...(cached.payload.dataQualityWarnings || []),
            "Serving the last cached summary because the live refresh failed.",
          ]),
        ],
      });
    }

    return res.status(503).json({
      error: "Metrics summary unavailable",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
