import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { supabaseUrl } from "@/lib/supabase"

/**
 * Service-role client for Supabase Auth Admin API only (create/delete/update users in auth.users).
 * The anon session client does not expose auth.admin. Never ship the service role key in a public
 * production bundle — prefer a small backend; for internal tooling, restrict who can load the app.
 */
let cached: SupabaseClient | null = null

export function getAdminServiceClient(): SupabaseClient | null {
  const key = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string | undefined
  if (!key?.trim()) return null
  if (!cached) {
    cached = createClient(supabaseUrl, key.trim(), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return cached
}
