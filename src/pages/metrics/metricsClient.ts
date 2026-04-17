import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let metricsClient: SupabaseClient | null = null;

export function getMetricsClient() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  if (!metricsClient) {
    metricsClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return metricsClient;
}
