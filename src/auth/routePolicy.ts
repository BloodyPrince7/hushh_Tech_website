import { DEFAULT_AUTH_REDIRECT, sanitizeInternalRedirect } from "../utils/security";
import { normalizeLegacyOnboardingRedirectTarget } from "../services/onboarding/flow";

export const GUEST_AUTH_ROUTE_PREFIXES = [
  "/login",
  "/signup",
  "/auth/callback",
  "/sign-nda",
  "/document-viewer",
] as const;

export const PUBLIC_MARKETING_ROUTE_PREFIXES = [
  "/",
  "/metric",
  "/metrics",
  "/privacy-policy",
  "/faq",
  "/carrer-privacy-policy",
  "/california-privacy-policy",
  "/eu-uk-jobs-privacy-policy",
  "/investor-guide",
  "/about",
  "/services",
  "/career",
  "/community",
  "/contact",
  "/benefits",
  "/hushh-ai",
  "/kai",
  "/kai-india",
  "/studio",
  "/kyc-flow",
  "/kyc-demo",
  "/a2a-playground",
] as const;

export const AUTHENTICATED_ACCOUNT_ROUTE_PREFIXES = [
  "/profile",
  "/delete-account",
  "/hushh-user-profile",
  "/onboarding",
  "/user-registration",
  "/investor-profile",
  "/user-profile",
  "/your-profile",
  "/nda-form",
] as const;

export const PUBLIC_SHARED_PROFILE_ROUTE_PREFIXES = [
  "/investor/",
  "/hushhid/",
] as const;

function normalizePathname(pathname: string): string {
  const trimmed = pathname.trim();
  if (!trimmed) {
    return "/";
  }

  return trimmed.toLowerCase();
}

function matchesRoute(pathname: string, route: string): boolean {
  const normalizedPath = normalizePathname(pathname);
  const normalizedRoute = normalizePathname(route);

  if (normalizedRoute === "/") {
    return normalizedPath === "/";
  }

  return (
    normalizedPath === normalizedRoute ||
    normalizedPath.startsWith(`${normalizedRoute}/`)
  );
}

function matchesSharedPrefix(pathname: string, routePrefix: string): boolean {
  return normalizePathname(pathname).startsWith(normalizePathname(routePrefix));
}

export function isGuestAuthRoute(pathname: string): boolean {
  return GUEST_AUTH_ROUTE_PREFIXES.some((route) => matchesRoute(pathname, route));
}

export function isPublicMarketingRoute(pathname: string): boolean {
  return PUBLIC_MARKETING_ROUTE_PREFIXES.some((route) =>
    matchesRoute(pathname, route)
  );
}

export function isAuthenticatedAccountRoute(pathname: string): boolean {
  return AUTHENTICATED_ACCOUNT_ROUTE_PREFIXES.some((route) =>
    matchesRoute(pathname, route)
  );
}

export function isPublicSharedProfileRoute(pathname: string): boolean {
  return PUBLIC_SHARED_PROFILE_ROUTE_PREFIXES.some((routePrefix) =>
    matchesSharedPrefix(pathname, routePrefix)
  );
}

export function canGuestAccessRoute(pathname: string): boolean {
  return (
    isGuestAuthRoute(pathname) ||
    isPublicMarketingRoute(pathname) ||
    isPublicSharedProfileRoute(pathname)
  );
}

export function buildLoginRedirectPath(
  pathname: string,
  search = "",
  hash = "",
  fallback = DEFAULT_AUTH_REDIRECT
): string {
  const redirectTarget = normalizeLegacyOnboardingRedirectTarget(
    sanitizeInternalRedirect(`${pathname || "/"}${search}${hash}`, fallback)
  );

  return `/login?redirect=${encodeURIComponent(redirectTarget)}`;
}
