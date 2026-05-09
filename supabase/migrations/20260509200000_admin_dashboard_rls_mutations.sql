-- Allow active dashboard admins (JWT) to manage public.users and public.user_areas
-- without Edge Functions. Uses SECURITY DEFINER helper to avoid RLS recursion.

CREATE OR REPLACE FUNCTION public.is_dashboard_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users AS u
    WHERE u.auth_user_id IS NOT NULL
      AND u.auth_user_id = auth.uid()
      AND u.role = 'admin'
      AND u.is_active = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_dashboard_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_dashboard_admin() TO authenticated;

GRANT INSERT, UPDATE, DELETE ON TABLE public.users TO authenticated;

CREATE POLICY users_insert_admin ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_dashboard_admin());

CREATE POLICY users_update_admin ON public.users
  FOR UPDATE
  TO authenticated
  USING (public.is_dashboard_admin())
  WITH CHECK (public.is_dashboard_admin());

CREATE POLICY users_delete_admin ON public.users
  FOR DELETE
  TO authenticated
  USING (public.is_dashboard_admin());

GRANT INSERT, DELETE ON TABLE public.user_areas TO authenticated;

CREATE POLICY user_areas_insert_admin ON public.user_areas
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_dashboard_admin());

CREATE POLICY user_areas_delete_admin ON public.user_areas
  FOR DELETE
  TO authenticated
  USING (public.is_dashboard_admin());
