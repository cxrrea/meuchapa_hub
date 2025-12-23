-- Temporary fix: Disable RLS to allow app to function while migration is applied
-- This is a temporary solution - the migration 20251223_fix_sector_policies.sql should be applied to the database

ALTER TABLE public.sectors DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sector_members DISABLE ROW LEVEL SECURITY;
