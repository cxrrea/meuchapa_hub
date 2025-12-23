-- Fix infinite recursion in sector_members policies
-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view sector members they're part of" ON public.sector_members;
DROP POLICY IF EXISTS "Sector creator and admins can manage members" ON public.sector_members;
DROP POLICY IF EXISTS "Sector creator and admins can remove members" ON public.sector_members;

-- Drop and recreate RLS on sector_members with simpler policies
ALTER TABLE public.sector_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sector_members ENABLE ROW LEVEL SECURITY;

-- New policy: Users can view sector members (no recursion)
CREATE POLICY "Users can view sector members" ON public.sector_members
  FOR SELECT
  USING (
    -- User is admin
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- New policy: Admins can insert members
CREATE POLICY "Admins can manage sector members" ON public.sector_members
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- New policy: Admins can delete members
CREATE POLICY "Admins can delete sector members" ON public.sector_members
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );
