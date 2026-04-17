import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();
const createTransport = vi.fn(() => ({
  sendMail,
}));
const buildMetricsSummary = vi.fn();
const buildMetricsReportEmail = vi.fn();
const clampWindowDays = vi.fn((value) => Number.parseInt(String(value || 7), 10));
const getMetricsTimezone = vi.fn(() => "America/Los_Angeles");

vi.mock("nodemailer", () => ({
  default: {
    createTransport,
  },
}));

vi.mock("../api/metrics/service.js", () => ({
  buildMetricsSummary,
  buildMetricsReportEmail,
  clampWindowDays,
  getMetricsTimezone,
}));

const createResponse = () => {
  let statusCode = 200;
  let body;

  return {
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
    end() {
      return this;
    },
  };
};

describe("metrics send-report route", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.GMAIL_USER = "metrics@hushh.ai";
    process.env.GMAIL_APP_PASSWORD = "app-password";
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_APP_PASSWORD;
    delete process.env.METRICS_REPORT_SHARED_SECRET;
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns a dry-run preview without sending mail", async () => {
    buildMetricsSummary.mockResolvedValue({
      window: {
        days: 7,
        startDate: "2026-04-09",
        endDate: "2026-04-15",
      },
    });
    buildMetricsReportEmail.mockReturnValue({
      subject: "report subject",
      html: "<p>preview</p>",
      text: "preview",
    });

    const { default: handler } = await import("../api/metrics/send-report.js");
    const req = {
      method: "POST",
      headers: {},
      query: {},
      body: {
        dryRun: true,
      },
    };
    const res = createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      dryRun: true,
      subject: "report subject",
    });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends the report email and returns metadata", async () => {
    buildMetricsSummary.mockResolvedValue({
      window: {
        days: 7,
        startDate: "2026-04-09",
        endDate: "2026-04-15",
      },
    });
    buildMetricsReportEmail.mockReturnValue({
      subject: "report subject",
      html: "<p>live</p>",
      text: "live",
    });
    sendMail.mockResolvedValue({
      messageId: "message-123",
    });

    const { default: handler } = await import("../api/metrics/send-report.js");
    const req = {
      method: "POST",
      headers: {},
      query: {},
      body: {
        recipients: ["ankit@hushh.ai"],
        runKey: "2026-04-15",
      },
    };
    const res = createResponse();

    await handler(req, res);

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ankit@hushh.ai",
        subject: "report subject",
      })
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      messageId: "message-123",
      runKey: "2026-04-15",
    });
  });
});
