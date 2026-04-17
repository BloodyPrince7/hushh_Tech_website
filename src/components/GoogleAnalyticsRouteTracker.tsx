import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import {
  initializeGoogleAnalytics,
  trackPageView,
} from "../services/analytics/googleAnalytics";

export default function GoogleAnalyticsRouteTracker() {
  const location = useLocation();

  useEffect(() => {
    initializeGoogleAnalytics();
  }, []);

  useEffect(() => {
    trackPageView(location.pathname, location.search, location.hash);
  }, [location.hash, location.pathname, location.search]);

  return null;
}
