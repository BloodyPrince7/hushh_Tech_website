/**
 * Shared TypeScript interfaces for the Hushh KPI dashboard.
 * The primary funnel comes from Supabase; traffic context is server-side GA4.
 */

/* ── Reporting window ── */
export interface WindowPayload {
  days: number;
  startDate: string;
  endDate: string;
  dates?: string[];
}

/* ── Business funnel daily series ── */
export interface BusinessSeriesRow {
  date: string;
  signups: number;
  persistedUsers: number;
  onboardingStarted: number;
  onboardingCompleted: number;
  profilesCreated: number;
  profilesConfirmed: number;
}

/* ── Business funnel overview ── */
export interface BusinessOverview {
  signups: number;
  persistedUsers: number;
  onboardingStarted: number;
  onboardingCompleted: number;
  profilesCreated: number;
  profilesConfirmed: number;
}

/* ── Conversion rates ── */
export interface ConversionRates {
  signupToPersistedUsers: number | null;
  signupToOnboardingStarted: number | null;
  onboardingCompletionRate: number | null;
  profileConfirmationRate: number | null;
}

/* ── Onboarding step breakdown ── */
export interface OnboardingStep {
  step: string;
  users: number;
}

/* ── KYC metrics ── */
export interface KycOverview {
  total: number;
  incomplete: number;
  pending: number;
  verified: number;
  plaidConnected: number;
  paymentCompleted: number;
}

/* ── NDA metrics ── */
export interface NdaOverview {
  totalSigned: number;
}

/* ── Identity verification metrics ── */
export interface IdentityOverview {
  total: number;
  pending: number;
  verified: number;
  failed: number;
  documentVerified: number;
  selfieVerified: number;
}

/* ── CEO meeting payment metrics ── */
export interface CeoMeetingOverview {
  total: number;
  completed: number;
  pending: number;
  totalRevenueCents: number;
  calendlyBooked: number;
}

/* ── Community metrics ── */
export interface CommunityOverview {
  totalRegistrations: number;
}

/* ── Product usage metrics ── */
export interface ProductUsageItem {
  productName: string;
  totalUsage: number;
  uniqueUsers: number;
}

/* ── Device/platform metrics ── */
export interface DeviceOverview {
  total: number;
  active: number;
  byPlatform: Record<string, number>;
}

/* ── Delete request metrics ── */
export interface DeleteRequestOverview {
  total: number;
  pending: number;
  completed: number;
}

/* ── Notification metrics ── */
export interface NotificationOverview {
  total: number;
  byChannel: Record<string, number>;
  byStatus: Record<string, number>;
}

/* ── Full summary payload ── */
export interface SummaryPayload {
  generatedAt: string;
  timezone: string;
  window: WindowPayload;

  businessFunnel: {
    source: string;
    overview: BusinessOverview;
    conversionRates: ConversionRates;
    onboardingStepBreakdown: OnboardingStep[];
    series: BusinessSeriesRow[];
  };

  kyc?: KycOverview;
  nda?: NdaOverview;
  identity?: IdentityOverview;
  ceoMeetings?: CeoMeetingOverview;
  community?: CommunityOverview;
  productUsage?: ProductUsageItem[];
  devices?: DeviceOverview;
  deleteRequests?: DeleteRequestOverview;
  notifications?: NotificationOverview;

  traffic: {
    source: string;
    available: boolean;
    overview: {
      active1DayUsers: number;
      active7DayUsers: number;
      active28DayUsers: number;
      sessions: number;
      engagedSessions: number;
      screenPageViews: number;
      newUsers: number;
      engagementRate: number | null;
      averageSessionDuration: number | null;
      realtimeActiveUsers: number | null;
    };
    series: Array<{
      date: string;
      activeUsers: number;
      sessions: number;
      screenPageViews: number;
      engagedSessions: number;
      newUsers: number;
    }>;
    note?: string;
    lookerStudioReportUrl?: string;
  };

  legacy: {
    source: string;
    available: boolean;
    overview: { usersCreated: number };
    series: Array<{ date: string; usersCreated: number }>;
    note?: string;
  };

  dataQualityWarnings: string[];
  stale?: boolean;
}

/* ── Component-level state ── */
export interface SummaryState {
  data: SummaryPayload | null;
  error: string | null;
  isLoading: boolean;
}
