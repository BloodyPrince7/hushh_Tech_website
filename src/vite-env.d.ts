/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Supabase
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_SUPABASE_REDIRECT_URL?: string;
  readonly VITE_PLAID_REDIRECT_URI?: string;
  readonly VITE_NDA_GENERATION_URL?: string;
  readonly VITE_GUEST_MODE_ACCESS_TOKEN?: string;
  readonly VITE_MARKET_SUPABASE_URL?: string;
  readonly VITE_MARKET_SUPABASE_KEY?: string;

  // Gemini API Keys (with fallback support)
  readonly VITE_GEMINI_API_KEY: string;
  readonly VITE_GEMINI_API_KEY_FALLBACK_1?: string;
  readonly VITE_GEMINI_API_KEY_FALLBACK_2?: string;
  readonly VITE_GEMINI_API_KEY_FALLBACK_3?: string;

  // OpenAI
  readonly VITE_OPENAI_API_KEY?: string;
  readonly VITE_ALLOW_INSECURE_BROWSER_LLM?: string;

  // n8n Webhook
  readonly VITE_N8N_WEBHOOK_URL?: string;

  // Voice Agent
  readonly VITE_VOICE_AGENT_URL?: string;
  // Finnhub Stock API
  readonly VITE_FINNHUB_API_KEY?: string;

  // KYC
  readonly VITE_KYC_ENV?: string;
  readonly VITE_KYC_API_BASE?: string;
  readonly VITE_KYC_DEMO_MODE?: string;
  readonly VITE_KYC_TEST_BANK_IDS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
