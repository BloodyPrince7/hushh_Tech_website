import nodemailer from "nodemailer";

import {
  buildMetricsReportEmail,
  buildMetricsSummary,
  clampWindowDays,
  getMetricsTimezone,
} from "./service.js";

const sentReportRuns = new Map();
const SENT_REPORT_TTL_MS = 36 * 60 * 60 * 1000;

function trimValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseRecipients(rawValue, fallbackValue) {
  const resolved = (Array.isArray(rawValue) ? rawValue.join(",") : String(rawValue || fallbackValue || ""))
    .split(",")
    .map((recipient) => recipient.trim())
    .filter(Boolean);

  return resolved.length > 0 ? resolved : ["ankit@hushh.ai"];
}

function cleanSentRunCache() {
  const now = Date.now();

  for (const [key, value] of sentReportRuns.entries()) {
    if (now - value.sentAt > SENT_REPORT_TTL_MS) {
      sentReportRuns.delete(key);
    }
  }
}

function isAuthorizedRequest(req) {
  const configuredSecret = trimValue(process.env.METRICS_REPORT_SHARED_SECRET);

  if (!configuredSecret) {
    return process.env.NODE_ENV !== "production";
  }

  const providedSecret =
    trimValue(req.headers["x-metrics-report-secret"]) ||
    trimValue(req.headers["x-hushh-metrics-secret"]) ||
    trimValue(
      String(req.headers.authorization || "").startsWith("Bearer ")
        ? String(req.headers.authorization).slice("Bearer ".length)
        : ""
    );

  return providedSecret === configuredSecret;
}

function createTransporter() {
  const user = trimValue(process.env.GMAIL_USER);
  const pass = trimValue(process.env.GMAIL_APP_PASSWORD);

  if (!user || !pass) {
    throw new Error("GMAIL_USER and GMAIL_APP_PASSWORD are required to send the metrics report");
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user,
      pass,
    },
  });
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAuthorizedRequest(req)) {
    return res.status(401).json({
      error: "Unauthorized",
      detail:
        "Provide METRICS_REPORT_SHARED_SECRET through x-metrics-report-secret or Authorization: Bearer",
    });
  }

  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body
      : {};
  const windowDays = clampWindowDays(body.windowDays || req.query?.window_days);
  const timezone = trimValue(body.timezone) || getMetricsTimezone(process.env);
  const recipients = parseRecipients(
    body.recipients,
    process.env.METRICS_REPORT_RECIPIENTS || "ankit@hushh.ai"
  );
  const dryRun =
    body.dryRun === true ||
    body.preview === true ||
    req.query?.dry_run === "1" ||
    req.query?.preview === "1";

  try {
    const summary = await buildMetricsSummary({
      windowDays,
      timezone,
    });
    const email = buildMetricsReportEmail(summary);
    const runKey =
      trimValue(body.runKey) ||
      `${timezone}:${summary.window.startDate}:${summary.window.endDate}`;

    cleanSentRunCache();

    if (!dryRun && sentReportRuns.has(runKey)) {
      const priorRun = sentReportRuns.get(runKey);

      return res.status(200).json({
        success: true,
        skipped: true,
        reason: "This report run key was already sent recently.",
        recipients,
        runKey,
        priorSentAt: priorRun.sentAt,
        window: summary.window,
      });
    }

    if (dryRun) {
      return res.status(200).json({
        success: true,
        dryRun: true,
        recipients,
        runKey,
        subject: email.subject,
        html: email.html,
        text: email.text,
        summary,
      });
    }

    const transporter = createTransporter();
    const fromAddress = trimValue(process.env.METRICS_REPORT_FROM_EMAIL) || trimValue(process.env.GMAIL_USER);
    const mailResult = await transporter.sendMail({
      from: `"Hushh Metrics" <${fromAddress}>`,
      to: recipients.join(", "),
      subject: email.subject,
      html: email.html,
      text: email.text,
    });

    sentReportRuns.set(runKey, {
      sentAt: Date.now(),
      messageId: mailResult.messageId,
    });

    return res.status(200).json({
      success: true,
      recipients,
      runKey,
      messageId: mailResult.messageId,
      window: summary.window,
      schedule: trimValue(process.env.METRICS_REPORT_SCHEDULE) || undefined,
    });
  } catch (error) {
    console.error("metrics send-report route error:", error);

    return res.status(500).json({
      error: "Metrics report failed",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
