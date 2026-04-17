import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";

const ANALYTICS_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const DEFAULT_WINDOW_DAYS = 7;
const DEFAULT_TIMEZONE = "America/Los_Angeles";
const DAY_MS = 24 * 60 * 60 * 1000;

function trimEnvValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ratio(numerator, denominator) {
  if (!denominator) {
    return null;
  }

  return numerator / denominator;
}

function dedupeWarnings(warnings) {
  return Array.from(
    new Set(
      warnings
        .map((warning) => warning?.trim())
        .filter(Boolean)
    )
  );
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

export function clampWindowDays(rawValue) {
  const parsed = Number.parseInt(String(rawValue ?? DEFAULT_WINDOW_DAYS), 10);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_WINDOW_DAYS;
  }

  return Math.min(Math.max(parsed, 1), 31);
}

export function getMetricsTimezone(env = process.env) {
  return trimEnvValue(env.METRICS_REPORT_TIMEZONE) || DEFAULT_TIMEZONE;
}

export function getDateKeyInTimezone(value, timezone) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  if (!values.year || !values.month || !values.day) {
    return null;
  }

  return `${values.year}-${values.month}-${values.day}`;
}

export function buildRollingWindow({
  now = new Date(),
  timezone = DEFAULT_TIMEZONE,
  windowDays = DEFAULT_WINDOW_DAYS,
} = {}) {
  const resolvedWindowDays = clampWindowDays(windowDays);
  const endDateKey = getDateKeyInTimezone(now, timezone);

  if (!endDateKey) {
    throw new Error("Unable to resolve the reporting window");
  }

  const [year, month, day] = endDateKey.split("-").map(Number);
  const anchorUtc = Date.UTC(year, month - 1, day);
  const dates = [];

  for (let offset = resolvedWindowDays - 1; offset >= 0; offset -= 1) {
    dates.push(formatDateKey(new Date(anchorUtc - offset * DAY_MS)));
  }

  return {
    days: resolvedWindowDays,
    startDate: dates[0],
    endDate: dates.at(-1),
    dates,
  };
}

function createSeriesMap(dates, fields) {
  return Object.fromEntries(
    dates.map((date) => [
      date,
      {
        date,
        ...Object.fromEntries(fields.map((field) => [field, 0])),
      },
    ])
  );
}

function finalizeSeries(seriesMap, dates) {
  return dates.map((date) => seriesMap[date]);
}

function incrementSeries(seriesMap, timezone, rawDate, field) {
  if (!rawDate) {
    return;
  }

  const dateKey = getDateKeyInTimezone(rawDate, timezone);
  if (!dateKey || !seriesMap[dateKey]) {
    return;
  }

  seriesMap[dateKey][field] += 1;
}

function normalizeLookerStudioUrl(rawUrl) {
  if (!rawUrl) {
    return undefined;
  }

  try {
    const url = new URL(rawUrl);

    if (url.protocol !== "https:") {
      return undefined;
    }

    if (url.pathname.startsWith("/embed/reporting/")) {
      url.pathname = url.pathname.replace("/embed/reporting/", "/reporting/");
    }

    return url.toString();
  } catch {
    return undefined;
  }
}

function isMissingTableError(error, tableName) {
  const message = `${error?.message || ""}`.toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    message.includes(`${tableName}`.toLowerCase())
  );
}

function isMissingColumnError(error, columnName) {
  const message = `${error?.message || ""}`.toLowerCase();
  return error?.code === "42703" || message.includes(columnName.toLowerCase());
}

function buildHostnameFilter(hostnames) {
  if (!hostnames.length) {
    return undefined;
  }

  return {
    orGroup: {
      expressions: hostnames.map((hostname) => ({
        filter: {
          fieldName: "hostName",
          stringFilter: {
            matchType: "EXACT",
            value: hostname,
          },
        },
      })),
    },
  };
}

function parseAllowedHostnames(rawValue) {
  return String(rawValue || "")
    .split(",")
    .map((hostname) => hostname.trim())
    .filter(Boolean);
}

function buildWindowFetchStartIso(window) {
  return `${window.startDate}T00:00:00.000Z`;
}

function createSupabaseAdminClient(url, serviceRoleKey) {
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getWebsiteSupabaseConfig(env) {
  const supabaseUrl =
    trimEnvValue(env.SUPABASE_URL) || trimEnvValue(env.VITE_SUPABASE_URL);
  const serviceRoleKey = trimEnvValue(env.SUPABASE_SERVICE_ROLE_KEY);
  const anonKey = trimEnvValue(env.VITE_SUPABASE_ANON_KEY);

  if (!supabaseUrl) {
    throw new Error(
      "SUPABASE_URL or VITE_SUPABASE_URL is required for business metrics"
    );
  }

  if (serviceRoleKey) {
    return {
      url: supabaseUrl,
      apiKey: serviceRoleKey,
      accessLevel: "service_role",
    };
  }

  if (anonKey) {
    return {
      url: supabaseUrl,
      apiKey: anonKey,
      accessLevel: "anon",
    };
  }

  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY is missing and no VITE_SUPABASE_ANON_KEY fallback is available"
  );
}

function getLegacySupabaseConfig(env) {
  const url = trimEnvValue(env.LEGACY_SUPABASE_URL);
  const serviceRoleKey =
    trimEnvValue(env.LEGACY_SUPABASE_SERVICE_ROLE_KEY) ||
    trimEnvValue(env.LEGACY_SUPABASE_KEY);

  if (!url || !serviceRoleKey) {
    return null;
  }

  return {
    url,
    serviceRoleKey,
  };
}

async function listAuthUsersInWindow(client, window, timezone) {
  const rows = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const response = await client.auth.admin.listUsers({
      page,
      perPage,
    });

    if (response.error) {
      throw new Error(`Failed to list website auth users: ${response.error.message}`);
    }

    const users = response.data?.users || [];

    for (const user of users) {
      const dateKey = getDateKeyInTimezone(user.created_at, timezone);
      if (dateKey && dateKey >= window.startDate && dateKey <= window.endDate) {
        rows.push({
          id: user.id,
          created_at: user.created_at,
          email: user.email || null,
        });
      }
    }

    if (users.length < perPage) {
      break;
    }

    page += 1;
  }

  return rows;
}

async function fetchWebsiteUsers(client, window) {
  const response = await client
    .from("users")
    .select("id, created_at, onboarding_step")
    .gte("created_at", buildWindowFetchStartIso(window));

  if (response.error) {
    throw new Error(`Failed to read public.users: ${response.error.message}`);
  }

  return response.data || [];
}

async function fetchOnboardingRows(client, window, warnings) {
  const primary = await client
    .from("onboarding_data")
    .select("id, created_at, is_completed, completed_at")
    .gte("created_at", buildWindowFetchStartIso(window));

  if (!primary.error) {
    return primary.data || [];
  }

  if (!isMissingColumnError(primary.error, "completed_at")) {
    throw new Error(`Failed to read onboarding_data: ${primary.error.message}`);
  }

  warnings.push(
    "Live schema drift: onboarding_data.completed_at is missing, so completed onboarding is bucketed by row creation date."
  );

  const fallback = await client
    .from("onboarding_data")
    .select("id, created_at, is_completed")
    .gte("created_at", buildWindowFetchStartIso(window));

  if (fallback.error) {
    throw new Error(`Failed to read onboarding_data: ${fallback.error.message}`);
  }

  return fallback.data || [];
}

async function fetchInvestorProfiles(client, window, warnings) {
  const primary = await client
    .from("investor_profiles")
    .select("id, created_at, user_confirmed, confirmed_at")
    .gte("created_at", buildWindowFetchStartIso(window));

  if (!primary.error) {
    return primary.data || [];
  }

  if (!isMissingColumnError(primary.error, "confirmed_at")) {
    throw new Error(`Failed to read investor_profiles: ${primary.error.message}`);
  }

  warnings.push(
    "Live schema drift: investor_profiles.confirmed_at is missing, so confirmed profiles are bucketed by row creation date."
  );

  const fallback = await client
    .from("investor_profiles")
    .select("id, created_at, user_confirmed")
    .gte("created_at", buildWindowFetchStartIso(window));

  if (fallback.error) {
    throw new Error(`Failed to read investor_profiles: ${fallback.error.message}`);
  }

  return fallback.data || [];
}

async function runSchemaAudit(client) {
  const warnings = [];

  const hushhAiUsersCheck = await client
    .from("hushh_ai_users")
    .select("id", { head: true, count: "exact" });

  if (hushhAiUsersCheck.error && isMissingTableError(hushhAiUsersCheck.error, "hushh_ai_users")) {
    warnings.push(
      "Live schema drift: public.hushh_ai_users is not exposed in the live website schema cache, even though repo migrations reference it."
    );
  }

  const productUsageCheck = await client
    .from("user_product_usage")
    .select("first_access_at, last_access_at")
    .limit(1);

  if (productUsageCheck.error && isMissingColumnError(productUsageCheck.error, "first_access_at")) {
    warnings.push(
      "Live schema drift: public.user_product_usage is missing first_access_at / last_access_at at runtime, so product-usage APIs are not used as KPI truth."
    );
  }

  return warnings;
}

async function fetchLegacyUsers(client, window, warnings) {
  const primary = await client
    .from("users")
    .select("id, accountCreation")
    .gte("accountCreation", buildWindowFetchStartIso(window));

  if (!primary.error) {
    return {
      available: true,
      rows: (primary.data || []).map((row) => ({
        id: row.id,
        created_at: row.accountCreation,
      })),
      note:
        "Legacy external profile flow remains read-only: /user-registration posts to hushh-api and /your-profile reads hushh-api check-user.",
      warnings: [],
    };
  }

  if (!isMissingColumnError(primary.error, "accountCreation")) {
    throw new Error(`Failed to read legacy public.users: ${primary.error.message}`);
  }

  warnings.push(
    "Legacy schema drift: public.users.accountCreation is missing, so legacy metrics fell back to created_at."
  );

  const fallback = await client
    .from("users")
    .select("id, created_at")
    .gte("created_at", buildWindowFetchStartIso(window));

  if (fallback.error) {
    throw new Error(`Failed to read legacy public.users: ${fallback.error.message}`);
  }

  return {
    available: true,
    rows: fallback.data || [],
    note:
      "Legacy external profile flow remains read-only: /user-registration posts to hushh-api and /your-profile reads hushh-api check-user.",
    warnings: [],
  };
}

async function fetchTrafficMetrics(env, window, warnings) {
  const propertyId = trimEnvValue(env.GA4_PROPERTY_ID);
  const lookerStudioReportUrl = normalizeLookerStudioUrl(
    trimEnvValue(env.LOOKER_STUDIO_EMBED_URL)
  );
  const allowedHostnames = parseAllowedHostnames(env.GA4_ALLOWED_HOSTNAMES);
  const seriesMap = createSeriesMap(window.dates, [
    "activeUsers",
    "sessions",
    "screenPageViews",
    "engagedSessions",
    "newUsers",
  ]);

  if (!propertyId) {
    warnings.push(
      "GA4_PROPERTY_ID is not configured, so the traffic section is unavailable."
    );

    return {
      available: false,
      source: "ga4-data-api",
      overview: {
        active1DayUsers: 0,
        active7DayUsers: 0,
        active28DayUsers: 0,
        sessions: 0,
        engagedSessions: 0,
        screenPageViews: 0,
        newUsers: 0,
        engagementRate: null,
        averageSessionDuration: null,
        realtimeActiveUsers: null,
      },
      series: finalizeSeries(seriesMap, window.dates),
      lookerStudioReportUrl,
      note: lookerStudioReportUrl
        ? "Traffic exploration is still available in Looker Studio, but it is not the KPI source of truth."
        : "Traffic exploration is unavailable until GA4 is configured.",
    };
  }

  const auth = new google.auth.GoogleAuth({
    scopes: [ANALYTICS_SCOPE],
  });
  const analyticsdata = google.analyticsdata({
    version: "v1beta",
    auth,
  });
  const dimensionFilter = buildHostnameFilter(allowedHostnames);
  const noteParts = [];

  if (allowedHostnames.length > 0) {
    noteParts.push(
      `Traffic reports are filtered to ${allowedHostnames.join(", ")}.`
    );
  }

  if (lookerStudioReportUrl) {
    noteParts.push(
      "Looker Studio remains optional for traffic exploration and is not used for KPI totals."
    );
  }

  try {
    const [totalsResponse, seriesResponse] = await Promise.all([
      analyticsdata.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: [
            {
              startDate: window.startDate,
              endDate: window.endDate,
            },
          ],
          metrics: [
            { name: "active1DayUsers" },
            { name: "active7DayUsers" },
            { name: "active28DayUsers" },
            { name: "sessions" },
            { name: "engagedSessions" },
            { name: "screenPageViews" },
            { name: "newUsers" },
            { name: "engagementRate" },
            { name: "averageSessionDuration" },
          ],
          ...(dimensionFilter ? { dimensionFilter } : {}),
        },
      }),
      analyticsdata.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: [
            {
              startDate: window.startDate,
              endDate: window.endDate,
            },
          ],
          dimensions: [{ name: "date" }],
          metrics: [
            { name: "activeUsers" },
            { name: "sessions" },
            { name: "screenPageViews" },
            { name: "engagedSessions" },
            { name: "newUsers" },
          ],
          ...(dimensionFilter ? { dimensionFilter } : {}),
        },
      }),
    ]);

    const totals = totalsResponse.data.rows?.[0]?.metricValues || [];
    const overview = {
      active1DayUsers: parseNumber(totals[0]?.value),
      active7DayUsers: parseNumber(totals[1]?.value),
      active28DayUsers: parseNumber(totals[2]?.value),
      sessions: parseNumber(totals[3]?.value),
      engagedSessions: parseNumber(totals[4]?.value),
      screenPageViews: parseNumber(totals[5]?.value),
      newUsers: parseNumber(totals[6]?.value),
      engagementRate:
        totals[7]?.value == null ? null : parseNumber(totals[7]?.value, null),
      averageSessionDuration:
        totals[8]?.value == null ? null : parseNumber(totals[8]?.value, null),
      realtimeActiveUsers: null,
    };

    for (const row of seriesResponse.data.rows || []) {
      const rawDate = row.dimensionValues?.[0]?.value;

      if (!rawDate || rawDate.length !== 8) {
        continue;
      }

      const dateKey = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
      if (!seriesMap[dateKey]) {
        continue;
      }

      seriesMap[dateKey].activeUsers = parseNumber(row.metricValues?.[0]?.value);
      seriesMap[dateKey].sessions = parseNumber(row.metricValues?.[1]?.value);
      seriesMap[dateKey].screenPageViews = parseNumber(row.metricValues?.[2]?.value);
      seriesMap[dateKey].engagedSessions = parseNumber(row.metricValues?.[3]?.value);
      seriesMap[dateKey].newUsers = parseNumber(row.metricValues?.[4]?.value);
    }

    try {
      const realtimeResponse = await analyticsdata.properties.runRealtimeReport({
        property: `properties/${propertyId}`,
        requestBody: {
          metrics: [{ name: "activeUsers" }],
          minuteRanges: [
            {
              name: "last30Minutes",
              startMinutesAgo: 29,
              endMinutesAgo: 0,
            },
          ],
        },
      });

      overview.realtimeActiveUsers = parseNumber(
        realtimeResponse.data.rows?.[0]?.metricValues?.[0]?.value,
        null
      );

      if (allowedHostnames.length > 0) {
        noteParts.push(
          "Realtime traffic is property-wide because the GA4 Realtime API does not support hostname filters."
        );
      }
    } catch (error) {
      warnings.push(
        `GA realtime is unavailable and was excluded from the traffic overview: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }

    return {
      available: true,
      source: "ga4-data-api",
      overview,
      series: finalizeSeries(seriesMap, window.dates),
      lookerStudioReportUrl,
      note: noteParts.join(" "),
    };
  } catch (error) {
    warnings.push(
      `GA traffic metrics are unavailable: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );

    return {
      available: false,
      source: "ga4-data-api",
      overview: {
        active1DayUsers: 0,
        active7DayUsers: 0,
        active28DayUsers: 0,
        sessions: 0,
        engagedSessions: 0,
        screenPageViews: 0,
        newUsers: 0,
        engagementRate: null,
        averageSessionDuration: null,
        realtimeActiveUsers: null,
      },
      series: finalizeSeries(seriesMap, window.dates),
      lookerStudioReportUrl,
      note: "Google Analytics traffic is currently unavailable.",
    };
  }
}

function createDefaultMetricsFetchers(env) {
  const websiteConfig = getWebsiteSupabaseConfig(env);
  const websiteClient = createSupabaseAdminClient(
    websiteConfig.url,
    websiteConfig.apiKey
  );
  const hasServiceRole = websiteConfig.accessLevel === "service_role";
  const legacyConfig = getLegacySupabaseConfig(env);
  const legacyClient = legacyConfig
    ? createSupabaseAdminClient(legacyConfig.url, legacyConfig.serviceRoleKey)
    : null;

  return {
    fetchWebsiteAuthUsers: async ({ window, timezone, warnings }) => {
      if (hasServiceRole) {
        return listAuthUsersInWindow(websiteClient, window, timezone);
      }

      warnings.push(
        "SUPABASE_SERVICE_ROLE_KEY is missing in this environment, so signups are falling back to public.users instead of auth.users."
      );

      const rows = await fetchWebsiteUsers(websiteClient, window);
      return rows.map((row) => ({
        id: row.id,
        created_at: row.created_at,
        email: null,
      }));
    },
    fetchWebsiteUsers: ({ window }) => fetchWebsiteUsers(websiteClient, window),
    fetchOnboardingRows: ({ window, warnings }) => {
      if (!hasServiceRole) {
        warnings.push(
          "Protected onboarding metrics are unavailable without the Supabase service role, so onboarding cards are showing partial fallback data."
        );
        return [];
      }

      return fetchOnboardingRows(websiteClient, window, warnings);
    },
    fetchInvestorProfiles: ({ window, warnings }) => {
      if (!hasServiceRole) {
        warnings.push(
          "Protected investor profile metrics are unavailable without the Supabase service role, so profile cards are showing partial fallback data."
        );
        return [];
      }

      return fetchInvestorProfiles(websiteClient, window, warnings);
    },
    runSchemaAudit: () => {
      if (!hasServiceRole) {
        return Promise.resolve([
          "Local fallback mode is active: protected tables and schema-drift checks require the server-side Supabase service role.",
        ]);
      }

      return runSchemaAudit(websiteClient);
    },
    fetchLegacyUsers: async ({ window, warnings }) => {
      if (!legacyClient) {
        warnings.push(
          "Legacy metrics are unavailable until LEGACY_SUPABASE_URL and LEGACY_SUPABASE_SERVICE_ROLE_KEY are configured on this service."
        );

        return {
          available: false,
          rows: [],
          note:
            "Legacy external profile flow remains separate and read-only until legacy Supabase credentials are configured.",
          warnings: [],
        };
      }

      return fetchLegacyUsers(legacyClient, window, warnings);
    },
    fetchTrafficMetrics: ({ window, warnings }) =>
      fetchTrafficMetrics(env, window, warnings),
  };
}

export async function buildMetricsSummary(options = {}) {
  const env = options.env || process.env;
  const timezone = options.timezone || getMetricsTimezone(env);
  const now = options.now ? new Date(options.now) : new Date();
  const window = buildRollingWindow({
    now,
    timezone,
    windowDays: options.windowDays,
  });
  const warnings = [];
  const fetchers = options.fetchers || createDefaultMetricsFetchers(env);

  const [
    websiteAuthUsers,
    websiteUsers,
    onboardingRows,
    investorProfiles,
    schemaWarnings,
    legacyMetrics,
    traffic,
  ] = await Promise.all([
    fetchers.fetchWebsiteAuthUsers({ window, timezone, warnings }),
    fetchers.fetchWebsiteUsers({ window, timezone, warnings }),
    fetchers.fetchOnboardingRows({ window, timezone, warnings }),
    fetchers.fetchInvestorProfiles({ window, timezone, warnings }),
    fetchers.runSchemaAudit({ window, timezone, warnings }),
    fetchers.fetchLegacyUsers({ window, timezone, warnings }),
    fetchers.fetchTrafficMetrics({ window, timezone, warnings }),
  ]);

  const businessSeriesMap = createSeriesMap(window.dates, [
    "signups",
    "persistedUsers",
    "onboardingStarted",
    "onboardingCompleted",
    "profilesCreated",
    "profilesConfirmed",
  ]);
  const legacySeriesMap = createSeriesMap(window.dates, ["usersCreated"]);

  for (const row of websiteAuthUsers) {
    incrementSeries(businessSeriesMap, timezone, row.created_at, "signups");
  }

  for (const row of websiteUsers) {
    incrementSeries(businessSeriesMap, timezone, row.created_at, "persistedUsers");
  }

  for (const row of onboardingRows) {
    incrementSeries(businessSeriesMap, timezone, row.created_at, "onboardingStarted");

    if (row.is_completed) {
      incrementSeries(
        businessSeriesMap,
        timezone,
        row.completed_at || row.created_at,
        "onboardingCompleted"
      );
    }
  }

  for (const row of investorProfiles) {
    incrementSeries(businessSeriesMap, timezone, row.created_at, "profilesCreated");

    if (row.user_confirmed) {
      incrementSeries(
        businessSeriesMap,
        timezone,
        row.confirmed_at || row.created_at,
        "profilesConfirmed"
      );
    }
  }

  for (const row of legacyMetrics.rows || []) {
    incrementSeries(legacySeriesMap, timezone, row.created_at, "usersCreated");
  }

  const businessSeries = finalizeSeries(businessSeriesMap, window.dates);
  const legacySeries = finalizeSeries(legacySeriesMap, window.dates);

  const onboardingStepBreakdown = Object.entries(
    websiteUsers.reduce((accumulator, row) => {
      const step = row.onboarding_step || "unknown";
      accumulator[step] = (accumulator[step] || 0) + 1;
      return accumulator;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([step, users]) => ({
      step,
      users,
    }));

  const businessOverview = businessSeries.reduce(
    (accumulator, row) => ({
      signups: accumulator.signups + row.signups,
      persistedUsers: accumulator.persistedUsers + row.persistedUsers,
      onboardingStarted: accumulator.onboardingStarted + row.onboardingStarted,
      onboardingCompleted: accumulator.onboardingCompleted + row.onboardingCompleted,
      profilesCreated: accumulator.profilesCreated + row.profilesCreated,
      profilesConfirmed: accumulator.profilesConfirmed + row.profilesConfirmed,
    }),
    {
      signups: 0,
      persistedUsers: 0,
      onboardingStarted: 0,
      onboardingCompleted: 0,
      profilesCreated: 0,
      profilesConfirmed: 0,
    }
  );

  const legacyOverview = legacySeries.reduce(
    (accumulator, row) => ({
      usersCreated: accumulator.usersCreated + row.usersCreated,
    }),
    {
      usersCreated: 0,
    }
  );

  if (businessOverview.signups !== businessOverview.persistedUsers) {
    warnings.push(
      `Website auth signups (${businessOverview.signups}) and website public.users rows (${businessOverview.persistedUsers}) diverged over the current ${window.days}-day window.`
    );
  }

  return {
    generatedAt: now.toISOString(),
    timezone,
    window: {
      days: window.days,
      startDate: window.startDate,
      endDate: window.endDate,
    },
    businessFunnel: {
      source: "website-supabase",
      overview: businessOverview,
      conversionRates: {
        signupToPersistedUsers: ratio(
          businessOverview.persistedUsers,
          businessOverview.signups
        ),
        signupToOnboardingStarted: ratio(
          businessOverview.onboardingStarted,
          businessOverview.signups
        ),
        onboardingCompletionRate: ratio(
          businessOverview.onboardingCompleted,
          businessOverview.onboardingStarted
        ),
        profileConfirmationRate: ratio(
          businessOverview.profilesConfirmed,
          businessOverview.profilesCreated
        ),
      },
      onboardingStepBreakdown,
      series: businessSeries,
    },
    traffic,
    legacy: {
      source: "legacy-hushh-api-supabase",
      available: Boolean(legacyMetrics.available),
      overview: legacyOverview,
      series: legacySeries,
      note:
        legacyMetrics.note ||
        "Legacy external profile flow remains separate and read-only during the audit phase.",
    },
    dataQualityWarnings: dedupeWarnings([
      ...warnings,
      ...(schemaWarnings || []),
      ...(legacyMetrics.warnings || []),
    ]),
  };
}

function formatPercent(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "n/a";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function formatDuration(seconds) {
  if (typeof seconds !== "number" || Number.isNaN(seconds)) {
    return "n/a";
  }

  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;

  return `${minutes}m ${remainingSeconds}s`;
}

export function buildMetricsReportEmail(summary) {
  const business = summary.businessFunnel.overview;
  const traffic = summary.traffic.overview;
  const legacy = summary.legacy.overview;
  const businessRows = summary.businessFunnel.series
    .map(
      (row) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #ece7da;">${escapeHtml(row.date)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #ece7da;text-align:right;">${escapeHtml(row.signups)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #ece7da;text-align:right;">${escapeHtml(row.persistedUsers)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #ece7da;text-align:right;">${escapeHtml(row.onboardingStarted)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #ece7da;text-align:right;">${escapeHtml(row.onboardingCompleted)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #ece7da;text-align:right;">${escapeHtml(row.profilesCreated)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #ece7da;text-align:right;">${escapeHtml(row.profilesConfirmed)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #ece7da;text-align:right;">${escapeHtml(summary.traffic.series.find((trafficRow) => trafficRow.date === row.date)?.sessions || 0)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #ece7da;text-align:right;">${escapeHtml(summary.traffic.series.find((trafficRow) => trafficRow.date === row.date)?.activeUsers || 0)}</td>
        </tr>
      `
    )
    .join("");
  const warningItems = summary.dataQualityWarnings
    .map(
      (warning) =>
        `<li style="margin:0 0 8px;">${escapeHtml(warning)}</li>`
    )
    .join("");
  const subject = `Hushh KPI report — last ${summary.window.days} days ending ${summary.window.endDate}`;

  const html = `
    <div style="background:#f7f3e8;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#171717;">
      <div style="max-width:980px;margin:0 auto;background:#fffaf0;border:1px solid #ece7da;border-radius:24px;overflow:hidden;">
        <div style="padding:28px 32px;border-bottom:1px solid #ece7da;background:#111111;color:#ffffff;">
          <div style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#d0c8b7;">Hushh KPI Report</div>
          <h1 style="margin:14px 0 8px;font-size:34px;line-height:1.05;font-weight:500;">Trustworthy 7-day business funnel snapshot</h1>
          <p style="margin:0;color:#d6d0c2;font-size:15px;">${escapeHtml(
            summary.window.startDate
          )} to ${escapeHtml(summary.window.endDate)} in ${escapeHtml(
    summary.timezone
  )}. Business funnel is the primary truth source; GA traffic stays secondary.</p>
        </div>

        <div style="padding:28px 32px;">
          <h2 style="margin:0 0 14px;font-size:19px;">Business funnel totals</h2>
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;">
            ${[
              ["Signups", business.signups],
              ["Persisted users", business.persistedUsers],
              ["Onboarding started", business.onboardingStarted],
              ["Onboarding completed", business.onboardingCompleted],
              ["Profiles created", business.profilesCreated],
              ["Profiles confirmed", business.profilesConfirmed],
            ]
              .map(
                ([label, value]) => `
                  <div style="border:1px solid #ece7da;border-radius:18px;padding:16px 18px;background:#ffffff;">
                    <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#6d6657;">${escapeHtml(label)}</div>
                    <div style="margin-top:10px;font-size:30px;font-weight:600;color:#111111;">${escapeHtml(value)}</div>
                  </div>
                `
              )
              .join("")}
          </div>

          <h2 style="margin:28px 0 14px;font-size:19px;">Conversion rates</h2>
          <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;">
            ${[
              ["Signup → persisted", formatPercent(summary.businessFunnel.conversionRates.signupToPersistedUsers)],
              ["Signup → onboarding", formatPercent(summary.businessFunnel.conversionRates.signupToOnboardingStarted)],
              ["Onboarding completion", formatPercent(summary.businessFunnel.conversionRates.onboardingCompletionRate)],
              ["Profile confirmation", formatPercent(summary.businessFunnel.conversionRates.profileConfirmationRate)],
            ]
              .map(
                ([label, value]) => `
                  <div style="border:1px solid #ece7da;border-radius:18px;padding:16px 18px;background:#ffffff;">
                    <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#6d6657;">${escapeHtml(label)}</div>
                    <div style="margin-top:10px;font-size:24px;font-weight:600;color:#111111;">${escapeHtml(value)}</div>
                  </div>
                `
              )
              .join("")}
          </div>

          <h2 style="margin:28px 0 14px;font-size:19px;">Traffic context</h2>
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;">
            ${[
              ["DAU", traffic.active1DayUsers],
              ["WAU", traffic.active7DayUsers],
              ["MAU", traffic.active28DayUsers],
              ["Sessions", traffic.sessions],
              ["Page views", traffic.screenPageViews],
              ["Engagement", formatPercent(traffic.engagementRate)],
              ["New users", traffic.newUsers],
              ["Avg session", formatDuration(traffic.averageSessionDuration)],
              ["Active now", traffic.realtimeActiveUsers ?? "n/a"],
            ]
              .map(
                ([label, value]) => `
                  <div style="border:1px solid #ece7da;border-radius:18px;padding:16px 18px;background:#ffffff;">
                    <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#6d6657;">${escapeHtml(label)}</div>
                    <div style="margin-top:10px;font-size:24px;font-weight:600;color:#111111;">${escapeHtml(value)}</div>
                  </div>
                `
              )
              .join("")}
          </div>

          <h2 style="margin:28px 0 14px;font-size:19px;">Daily breakdown</h2>
          <div style="overflow:auto;border:1px solid #ece7da;border-radius:18px;">
            <table style="width:100%;border-collapse:collapse;font-size:14px;background:#ffffff;">
              <thead style="background:#f7f3e8;color:#403b31;text-transform:uppercase;font-size:11px;letter-spacing:0.12em;">
                <tr>
                  <th style="padding:12px;text-align:left;">Date</th>
                  <th style="padding:12px;text-align:right;">Signups</th>
                  <th style="padding:12px;text-align:right;">Persisted</th>
                  <th style="padding:12px;text-align:right;">Started</th>
                  <th style="padding:12px;text-align:right;">Completed</th>
                  <th style="padding:12px;text-align:right;">Profiles</th>
                  <th style="padding:12px;text-align:right;">Confirmed</th>
                  <th style="padding:12px;text-align:right;">Sessions</th>
                  <th style="padding:12px;text-align:right;">Active users</th>
                </tr>
              </thead>
              <tbody>
                ${businessRows}
              </tbody>
            </table>
          </div>

          <h2 style="margin:28px 0 14px;font-size:19px;">Legacy appendix</h2>
          <div style="border:1px solid #ece7da;border-radius:18px;padding:18px;background:#ffffff;">
            <p style="margin:0 0 8px;"><strong>Legacy users created:</strong> ${escapeHtml(
              legacy.usersCreated
            )}</p>
            <p style="margin:0;color:#5b5549;">${escapeHtml(summary.legacy.note)}</p>
          </div>

          <h2 style="margin:28px 0 14px;font-size:19px;">Data quality warnings</h2>
          ${
            warningItems
              ? `<ul style="margin:0;padding-left:20px;color:#5b5549;">${warningItems}</ul>`
              : `<p style="margin:0;color:#5b5549;">No active data quality warnings.</p>`
          }
        </div>
      </div>
    </div>
  `;

  const text = [
    subject,
    "",
    `Window: ${summary.window.startDate} to ${summary.window.endDate} (${summary.timezone})`,
    "",
    `Signups: ${business.signups}`,
    `Persisted users: ${business.persistedUsers}`,
    `Onboarding started: ${business.onboardingStarted}`,
    `Onboarding completed: ${business.onboardingCompleted}`,
    `Profiles created: ${business.profilesCreated}`,
    `Profiles confirmed: ${business.profilesConfirmed}`,
    "",
    `Traffic DAU / WAU / MAU: ${traffic.active1DayUsers} / ${traffic.active7DayUsers} / ${traffic.active28DayUsers}`,
    `Traffic sessions: ${traffic.sessions}`,
    `Traffic page views: ${traffic.screenPageViews}`,
    `Traffic new users: ${traffic.newUsers}`,
    `Traffic engagement: ${formatPercent(traffic.engagementRate)}`,
    `Traffic avg session: ${formatDuration(traffic.averageSessionDuration)}`,
    "",
    `Legacy users created: ${legacy.usersCreated}`,
    `Legacy note: ${summary.legacy.note}`,
    "",
    "Warnings:",
    ...(summary.dataQualityWarnings.length
      ? summary.dataQualityWarnings.map((warning) => `- ${warning}`)
      : ["- None"]),
  ].join("\n");

  return {
    subject,
    html,
    text,
  };
}
