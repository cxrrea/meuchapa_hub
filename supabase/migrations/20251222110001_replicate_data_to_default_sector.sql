-- Create a default sector for existing data
INSERT INTO public.sectors (name, description, color, created_by)
SELECT 
  'Padrão',
  'Setor padrão criado automaticamente',
  '#3b82f6',
  (SELECT id FROM public.profiles WHERE role = 'admin' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM public.sectors WHERE name = 'Padrão');

-- Get the default sector ID
WITH default_sector AS (
  SELECT id FROM public.sectors WHERE name = 'Padrão' LIMIT 1
)
-- Replicate ticket statuses for the default sector
INSERT INTO public.ticket_statuses (name, color, description, is_default, order_index, sector_id)
SELECT 
  ts.name,
  ts.color,
  ts.description,
  ts.is_default,
  ts.order_index,
  ds.id
FROM public.ticket_statuses ts
CROSS JOIN default_sector ds
WHERE ts.sector_id IS NULL
AND NOT EXISTS (
  SELECT 1 FROM public.ticket_statuses ts2 
  WHERE ts2.sector_id = ds.id AND ts2.name = ts.name
);

-- Add default sector to all existing tickets that don't have a sector
WITH default_sector AS (
  SELECT id FROM public.sectors WHERE name = 'Padrão' LIMIT 1
)
UPDATE public.tickets
SET sector_id = (SELECT id FROM default_sector)
WHERE sector_id IS NULL;

-- Add all analysts to the default sector
WITH default_sector AS (
  SELECT id FROM public.sectors WHERE name = 'Padrão' LIMIT 1
)
INSERT INTO public.sector_members (sector_id, user_id)
SELECT ds.id, p.id
FROM default_sector ds, public.profiles p
WHERE p.role IN ('analyst', 'admin')
AND NOT EXISTS (
  SELECT 1 FROM public.sector_members sm 
  WHERE sm.sector_id = ds.id AND sm.user_id = p.id
)
ON CONFLICT DO NOTHING;
