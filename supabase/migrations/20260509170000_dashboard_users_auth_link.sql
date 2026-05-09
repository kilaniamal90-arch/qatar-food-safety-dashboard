-- Dashboard user profiles linked to Supabase Auth (auth.users).
-- Email lives in auth; role, areas, import flag, and active state live here.
-- area_ids stores public.areas.id values as text so this works whether areas.id is uuid or text.

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'inspector_manager', 'inspector')),
  area_ids TEXT[] NOT NULL DEFAULT '{}',
  can_import BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON public.users (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_users_role_active ON public.users (role, is_active);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read their own profile (session / AuthContext).
CREATE POLICY users_select_own ON public.users
  FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

-- Active admins can read all profiles (admin UI can use Edge Function instead;
-- this enables future client-side reads if needed).
CREATE POLICY users_select_if_admin ON public.users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users AS ad
      WHERE ad.auth_user_id = auth.uid()
        AND ad.role = 'admin'
        AND ad.is_active = true
    )
  );

GRANT SELECT ON TABLE public.users TO authenticated;
GRANT ALL ON TABLE public.users TO service_role;

COMMENT ON TABLE public.users IS 'App profile per auth user: role, areas, import access, active flag.';

-- ---------------------------------------------------------------------------
-- Initial sync: one row in public.users per auth user (if missing).
-- admin@foodsafety.qa gets admin + all areas + import.
-- ---------------------------------------------------------------------------
INSERT INTO public.users (auth_user_id, role, area_ids, can_import, is_active, full_name)
SELECT
  au.id,
  CASE
    WHEN lower(au.email) = lower('admin@foodsafety.qa') THEN 'admin'
    ELSE 'inspector'
  END,
  COALESCE(
    (SELECT array_agg(a.id::text ORDER BY a.name_ar) FROM public.areas AS a),
    '{}'::text[]
  ),
  CASE
    WHEN lower(au.email) = lower('admin@foodsafety.qa') THEN true
    ELSE false
  END,
  true,
  COALESCE(
    NULLIF(btrim(au.raw_user_meta_data->>'full_name'), ''),
    NULLIF(btrim(au.raw_user_meta_data->>'name'), ''),
    split_part(au.email, '@', 1)
  )
FROM auth.users AS au
WHERE NOT EXISTS (
  SELECT 1 FROM public.users AS u WHERE u.auth_user_id = au.id
)
ON CONFLICT (auth_user_id) DO NOTHING;

-- Ensure admin@foodsafety.qa row exists with full admin flags if already present but stale.
UPDATE public.users AS u
SET
  role = 'admin',
  can_import = true,
  is_active = true,
  area_ids = COALESCE(
    (SELECT array_agg(a.id::text ORDER BY a.name_ar) FROM public.areas AS a),
    u.area_ids
  ),
  updated_at = NOW()
FROM auth.users AS au
WHERE u.auth_user_id = au.id
  AND lower(au.email) = lower('admin@foodsafety.qa')
  AND (
    u.role IS DISTINCT FROM 'admin'
    OR u.can_import IS DISTINCT FROM true
    OR u.is_active IS DISTINCT FROM true
  );
