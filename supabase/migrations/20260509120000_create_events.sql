-- Events management (dashboard ticker + admin CRUD)
-- Optional: uuid_generate_v4() needs uuid-ossp; use gen_random_uuid() instead if you prefer.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title_ar TEXT NOT NULL,
  title_en TEXT NOT NULL,
  description_ar TEXT,
  description_en TEXT,
  area_name_ar TEXT,
  area_name_en TEXT,
  event_date DATE NOT NULL,
  year INTEGER NOT NULL,
  icon TEXT NOT NULL DEFAULT '🎯',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_year_active_date ON public.events (year, is_active, event_date);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations" ON public.events FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON TABLE public.events TO anon, authenticated, service_role;
