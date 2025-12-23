-- Add sector_id to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL;

-- Create sector_categories table
CREATE TABLE IF NOT EXISTS public.sector_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID NOT NULL REFERENCES public.sectors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(sector_id, name)
);

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_sector_id ON public.profiles(sector_id);
CREATE INDEX IF NOT EXISTS idx_sector_categories_sector_id ON public.sector_categories(sector_id);
