-- Rename app role inspector_manager -> supervisor (matches CHECK constraint).

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;

UPDATE public.users
SET role = 'supervisor'
WHERE role = 'inspector_manager';

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'supervisor', 'inspector'));
