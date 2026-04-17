import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const buildMetricsSummary = vi.fn();
const clampWindowDays = vi.fn((value) => Number.parseInt(String(value || 7), 10));

vi.mock("../api/metrics/service.js", () => ({
  buildMetricsSummary,
  clampWindowDays,
}));

const createResponse = () => {
  const headers = new Map();
  let statusCode = 200;
  let body;

  return {
    headers,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
    setHeader(name, value) {
      headers.set(name, value);
    },
  };
};

describe("metrics summary route", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns the summary payload", async () => {
    buildMetricsSummary.mockResolvedValue({
      generatedAt: "2026-04-15T00:00:00.000Z",
      timezone: "America/Los_Angeles",
      window: {
        days: 7,
        startDate: "2026-04-09",
        endDate: "2026-04-15",
      },
      businessFunnel: {
        overview: {
          signups: 4,
          persistedUsers: 4,
          onboardingStarted: 1,
          onboardingCompleted: 1,
          profilesCreated: 1,
          profilesConfirmed: 1,
        },
        conversionRates: {},
        onboardingStepBreakdown: [],
        series: [],
      },
      traffic: {
        available: true,
        overview: {},
        series: [],
      },
      legacy: {
        available: true,
        overview: { usersCreated: 0 },
        series: [],
      },
      dataQualityWarnings: [],
    });

    const { default: handler } = await import("../api/metrics/summary.js");
    const req = {
      method: "GET",
      query: {
        window_days: "7",
      },
    };
    const res = createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.body.window.endDate).toBe("2026-04-15");
    expect(clampWindowDays).toHaveBeenCalledWith("7");
    expect(buildMetricsSummary).toHaveBeenCalledWith({
      windowDays: 7,
    });
  });

  it("rejects non-GET methods", async () => {
    const { default: handler } = await import("../api/metrics/summary.js");
    const req = { method: "POST", query: {} };
    const res = createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ error: "Method not allowed" });
  });
});
