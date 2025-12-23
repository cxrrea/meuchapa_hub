-- Add analyst observation column to tickets
ALTER TABLE public.tickets
ADD COLUMN analyst_observation text;