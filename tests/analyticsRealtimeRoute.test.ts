import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const googleAuthFactory = vi.fn();
const runRealtimeReport = vi.fn();
const analyticsdataFactory = vi.fn(() => ({
  properties: {
    runRealtimeReport,
  },
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      GoogleAuth: googleAuthFactory,
    },
    analyticsdata: analyticsdataFactory,
  },
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

describe("analytics realtime route", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.GA4_PROPERTY_ID;
    delete process.env.GA4_ALLOWED_HOSTNAMES;
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns aggregate active users from GA4", async () => {
    process.env.GA4_PROPERTY_ID = "123456789";
    process.env.GA4_ALLOWED_HOSTNAMES = "hushhtech.com,www.hushhtech.com";
    runRealtimeReport.mockResolvedValue({
      data: {
        rows: [{ metricValues: [{ value: "27" }] }],
      },
    });

    const { default: handler } = await import("../api/analytics/realtime.js");
    const req = { method: "GET" };
    const res = createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      activeUsers: 27,
      stale: false,
      source: "ga4-data-api",
      windowMinutes: 30,
      refreshIntervalMs: 60000,
    });
    expect(googleAuthFactory).toHaveBeenCalledWith({
      scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
    });
    expect(runRealtimeReport).toHaveBeenCalledWith({
      property: "properties/123456789",
      requestBody: expect.objectContaining({
        metrics: [{ name: "activeUsers" }],
      }),
    });
  });

  it("returns a configuration error when GA4 property id is missing", async () => {
    const { default: handler } = await import("../api/analytics/realtime.js");
    const req = { method: "GET" };
    const res = createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({
      error: "Realtime analytics unavailable",
      detail: "GA4_PROPERTY_ID is not configured",
    });
  });
});
