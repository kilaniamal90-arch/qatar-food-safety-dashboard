-- Upgrade: drop area_id FK (if present) and use free-text area names.
-- Safe for DBs that already ran the older events migration with area_id.
-- Also safe when events was created with area_name_* only (columns IF NOT EXISTS).

ALTER TABLE public.events DROP COLUMN IF EXISTS area_id;

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS area_name_ar TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS area_name_en TEXT;
