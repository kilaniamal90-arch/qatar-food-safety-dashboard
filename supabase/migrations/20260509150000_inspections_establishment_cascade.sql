-- Inspections: delete all rows for an establishment when the establishment is deleted (CASCADE).
-- Constraint name matches common Postgres default; adjust if your DB used a different name.

ALTER TABLE public.inspections
  DROP CONSTRAINT IF EXISTS inspections_establishment_id_fkey;

ALTER TABLE public.inspections
  ADD CONSTRAINT inspections_establishment_id_fkey
  FOREIGN KEY (establishment_id)
  REFERENCES public.establishments(id)
  ON DELETE CASCADE;
