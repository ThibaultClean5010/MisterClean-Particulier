import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "./env.js";

let client: SupabaseClient<any, "public", any> | undefined;

export function getSupabaseAdmin() {
  if (!client) {
    const env = getEnv();
    client = createClient<any, "public", any>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}
