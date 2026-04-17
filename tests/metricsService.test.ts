import { describe, expect, it } from "vitest";

import {
  buildMetricsSummary,
  buildRollingWindow,
  getDateKeyInTimezone,
} from "../api/metrics/service.js";

describe("metrics service", () => {
  it("builds a Pacific-time rolling window", () => {
    const window = buildRollingWindow({
      now: "2026-04-15T18:30:00.000Z",
      timezone: "America/Los_Angeles",
      windowDays: 7,
    });

    expect(window).toEqual({
      days: 7,
      startDate: "2026-04-09",
      endDate: "2026-04-15",
      dates: [
        "2026-04-09",
        "2026-04-10",
        "2026-04-11",
        "2026-04-12",
        "2026-04-13",
        "2026-04-14",
        "2026-04-15",
      ],
    });
    expect(
      getDateKeyInTimezone("2026-04-10T02:30:00.000Z", "America/Los_Angeles")
    ).toBe("2026-04-09");
  });

  it("assembles the dual-funnel summary from injected fetchers", async () => {
    const summary = await buildMetricsSummary({
      now: "2026-04-15T18:30:00.000Z",
      timezone: "America/Los_Angeles",
      windowDays: 7,
      fetchers: {
        fetchWebsiteAuthUsers: async () => [
          {
            id: "auth-1",
            created_at: "2026-04-09T18:00:00.000Z",
          },
          {
            id: "auth-2",
            created_at: "2026-04-10T02:30:00.000Z",
          },
        ],
        fetchWebsiteUsers: async () => [
          {
            id: "user-1",
            created_at: "2026-04-09T18:00:00.000Z",
            onboarding_step: "landing",
          },
        ],
        fetchOnboardingRows: async () => [
          {
            id: "onboarding-1",
            created_at: "2026-04-10T21:00:00.000Z",
            is_completed: true,
            completed_at: "2026-04-12T21:00:00.000Z",
          },
        ],
        fetchInvestorProfiles: async () => [
          {
            id: "profile-1",
            created_at: "2026-04-11T18:00:00.000Z",
            user_confirmed: true,
            confirmed_at: "2026-04-14T17:00:00.000Z",
          },
        ],
        runSchemaAudit: async () => ["schema warning"],
        fetchLegacyUsers: async () => ({
          available: true,
          rows: [
            {
              id: "legacy-1",
              created_at: "2026-04-13T15:00:00.000Z",
            },
          ],
          note: "legacy note",
          warnings: ["legacy warning"],
        }),
        fetchTrafficMetrics: async () => ({
          available: true,
          source: "ga4-data-api",
          overview: {
            active1DayUsers: 12,
            active7DayUsers: 24,
            active28DayUsers: 40,
            sessions: 50,
            engagedSessions: 35,
            screenPageViews: 88,
            newUsers: 9,
            engagementRate: 0.7,
            averageSessionDuration: 132,
            realtimeActiveUsers: 3,
          },
          series: [
            {
              date: "2026-04-09",
              activeUsers: 4,
              sessions: 6,
              screenPageViews: 8,
              engagedSessions: 4,
              newUsers: 1,
            },
            {
              date: "2026-04-10",
              activeUsers: 2,
              sessions: 3,
              screenPageViews: 5,
              engagedSessions: 2,
              newUsers: 1,
            },
            {
              date: "2026-04-11",
              activeUsers: 0,
              sessions: 0,
              screenPageViews: 0,
              engagedSessions: 0,
              newUsers: 0,
            },
            {
              date: "2026-04-12",
              activeUsers: 0,
              sessions: 0,
              screenPageViews: 0,
              engagedSessions: 0,
              newUsers: 0,
            },
            {
              date: "2026-04-13",
              activeUsers: 0,
              sessions: 0,
              screenPageViews: 0,
              engagedSessions: 0,
              newUsers: 0,
            },
            {
              date: "2026-04-14",
              activeUsers: 0,
              sessions: 0,
              screenPageViews: 0,
              engagedSessions: 0,
              newUsers: 0,
            },
            {
              date: "2026-04-15",
              activeUsers: 0,
              sessions: 0,
              screenPageViews: 0,
              engagedSessions: 0,
              newUsers: 0,
            },
          ],
          note: "traffic note",
        }),
      },
    });

    expect(summary.window).toEqual({
      days: 7,
      startDate: "2026-04-09",
      endDate: "2026-04-15",
    });
    expect(summary.businessFunnel.overview).toEqual({
      signups: 2,
      persistedUsers: 1,
      onboardingStarted: 1,
      onboardingCompleted: 1,
      profilesCreated: 1,
      profilesConfirmed: 1,
    });
    expect(summary.businessFunnel.series.find((row) => row.date === "2026-04-09"))
      .toMatchObject({
        signups: 2,
        persistedUsers: 1,
      });
    expect(summary.businessFunnel.series.find((row) => row.date === "2026-04-12"))
      .toMatchObject({
        onboardingCompleted: 1,
      });
    expect(summary.businessFunnel.series.find((row) => row.date === "2026-04-14"))
      .toMatchObject({
        profilesConfirmed: 1,
      });
    expect(summary.businessFunnel.conversionRates.signupToPersistedUsers).toBe(0.5);
    expect(summary.legacy.overview.usersCreated).toBe(1);
    expect(summary.traffic.overview.active28DayUsers).toBe(40);
    expect(summary.dataQualityWarnings).toEqual(
      expect.arrayContaining([
        "schema warning",
        "legacy warning",
        "Website auth signups (2) and website public.users rows (1) diverged over the current 7-day window.",
      ])
    );
  });
});
