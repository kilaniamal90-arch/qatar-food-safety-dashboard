-- Pending users (no Supabase Auth yet), user_areas junction, optional email/name/password_hash on users.
-- Safe to run on projects that already applied 20260509170000_dashboard_users_auth_link.sql

-- Allow users without auth linkage (invited / provisioned rows).
ALTER TABLE public.users ALTER COLUMN auth_user_id DROP NOT NULL;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS name TEXT;

-- Many-to-many: users ↔ areas (area_id as TEXT; matches text[] area_ids / string area ids).
CREATE TABLE IF NOT EXISTS public.user_areas (
  user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  area_id TEXT NOT NULL,
  PRIMARY KEY (user_id, area_id)
);

CREATE INDEX IF NOT EXISTS idx_user_areas_user ON public.user_areas (user_id);
CREATE INDEX IF NOT EXISTS idx_user_areas_area ON public.user_areas (area_id);

-- Optional FK to areas when types align (ignore failures).
DO $$
BEGIN
  ALTER TABLE public.user_areas
    ADD CONSTRAINT user_areas_area_id_fkey
    FOREIGN KEY (area_id) REFERENCES public.areas (id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_column THEN NULL;
  WHEN datatype_mismatch THEN NULL;
END $$;

ALTER TABLE public.user_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_areas_select_own ON public.user_areas
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users AS u
      WHERE u.id = user_areas.user_id
        AND u.auth_user_id IS NOT NULL
        AND u.auth_user_id = auth.uid()
    )
  );

CREATE POLICY user_areas_select_admin ON public.user_areas
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

GRANT SELECT ON TABLE public.user_areas TO authenticated;
GRANT ALL ON TABLE public.user_areas TO service_role;

-- Backfill junction from legacy area_ids[] when user_areas is empty for that user.
INSERT INTO public.user_areas (user_id, area_id)
SELECT u.id, btrim(x.a)
FROM public.users AS u
CROSS JOIN LATERAL unnest(COALESCE(u.area_ids, ARRAY[]::text[])) AS x(a)
WHERE btrim(x.a) <> ''
  AND NOT EXISTS (SELECT 1 FROM public.user_areas ua WHERE ua.user_id = u.id)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.user_areas IS 'Jurisdictions assigned to a dashboard user (many-to-many).';
