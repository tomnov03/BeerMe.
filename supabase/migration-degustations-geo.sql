-- Migration : géolocalisation des bars (à exécuter dans Supabase → SQL Editor)
ALTER TABLE public.degustations
  ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_degustations_geo
  ON public.degustations (user_id)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
