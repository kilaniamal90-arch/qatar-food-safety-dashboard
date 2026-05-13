-- ============================================================================
-- Supabase / PostgreSQL RLS security audit queries
-- Run sections in the Supabase SQL Editor (preferably as postgres / dashboard owner).
--
-- Notes:
-- - `service_role` and table owners bypass RLS unless FORCE ROW LEVEL SECURITY.
-- - PostgREST exposes only tables/schemas you grant + enable in API settings.
-- - JWT claims (`auth.uid()`, `auth.jwt()`) are set by Supabase; plain SQL Editor
--   runs as the database role you connect with, not as an end-user JWT.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) RLS enabled on all tables (public schema application tables)
--    Expect: relrowsecurity = true for every table reachable via the API.
-- ----------------------------------------------------------------------------
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls_for_table_owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;

-- Tables in `public` where RLS is NOT enabled (potential gap — review each row).
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity IS FALSE
ORDER BY c.relname;

-- ----------------------------------------------------------------------------
-- 2) Policy count per table
-- ----------------------------------------------------------------------------
SELECT
  schemaname,
  tablename,
  COUNT(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY schemaname, tablename
ORDER BY tablename;

-- Tables with RLS on but zero policies (usually means deny-all for non-owner /
-- non-bypass roles — verify intentionally).
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity IS TRUE
GROUP BY n.nspname, c.relname
HAVING COUNT(p.policyname) = 0
ORDER BY c.relname;

-- ----------------------------------------------------------------------------
-- 3) All policy names and rules (USING / WITH CHECK expressions)
-- ----------------------------------------------------------------------------
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ----------------------------------------------------------------------------
-- 4) Anonymous role (`anon`) — privileges and explicit policies
--
--    Cross-check with Dashboard → Authentication → Policies and API schema exposure.
-- ----------------------------------------------------------------------------
-- 4a) Table/object privileges granted directly to `anon` on public tables
SELECT
  table_schema,
  table_name,
  privilege_type,
  is_grantable
FROM information_schema.table_privileges
WHERE grantee = 'anon'
  AND table_schema = 'public'
ORDER BY table_name, privilege_type;

-- 4b) Policies that apply when `anon` is listed as a target role
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND 'anon'::name = ANY (roles)
ORDER BY tablename, policyname;

-- 4c) Optional: simulate anon SELECT (must run as a superuser-capable role).
--     Expect errors or zero rows on sensitive tables depending on grants/policies.
--     Uncomment and adjust table names as needed.
/*
BEGIN;
SET LOCAL ROLE anon;
SELECT current_user;
-- SELECT count(*) AS users_visible FROM public.users;
-- SELECT count(*) AS establishments_visible FROM public.establishments;
ROLLBACK;
*/

-- ----------------------------------------------------------------------------
-- 5) Admin-only and sensitive tables — policy inventory
--
--    Adjust the list to match tables you treat as admin-managed reference data
--    or account metadata (this project uses several from the dashboard app).
-- ----------------------------------------------------------------------------
WITH sensitive AS (
  SELECT unnest(
    ARRAY[
      'users',
      'user_areas',
      'areas',
      'years',
      'ratings',
      'operational_statuses',
      'inspectors',
      'events',
      'establishments',
      'establishment_status_history',
      'inspections'
    ]::text[]
  ) AS table_name
)
SELECT
  p.schemaname,
  p.tablename,
  p.policyname,
  p.cmd,
  p.roles,
  p.qual AS using_expression,
  p.with_check AS with_check_expression
FROM pg_policies p
JOIN sensitive s ON s.table_name = p.tablename
WHERE p.schemaname = 'public'
ORDER BY p.tablename, p.policyname;

-- Policies whose expressions mention admin helpers or role checks (quick heuristic).
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    coalesce(qual, '') ILIKE '%admin%'
    OR coalesce(with_check, '') ILIKE '%admin%'
    OR coalesce(qual, '') ILIKE '%is_dashboard_admin%'
    OR coalesce(with_check, '') ILIKE '%is_dashboard_admin%'
    OR coalesce(qual, '') ILIKE '%auth.uid()%'
    OR coalesce(with_check, '') ILIKE '%auth.uid()%'
  )
ORDER BY tablename, policyname;

-- ----------------------------------------------------------------------------
-- Bonus A: Roles that bypass RLS (should be very few)
-- ----------------------------------------------------------------------------
SELECT rolname, rolbypassrls
FROM pg_roles
WHERE rolbypassrls IS TRUE
ORDER BY rolname;

-- ----------------------------------------------------------------------------
-- Bonus B: SECURITY DEFINER functions in public (review for safe search_path & grants)
-- ----------------------------------------------------------------------------
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef IS TRUE
ORDER BY p.proname;

-- ----------------------------------------------------------------------------
-- Bonus C: Authenticated role — table privileges on public (spot over-broad GRANTs)
-- ----------------------------------------------------------------------------
SELECT
  table_schema,
  table_name,
  privilege_type
FROM information_schema.table_privileges
WHERE grantee = 'authenticated'
  AND table_schema = 'public'
ORDER BY table_name, privilege_type;
