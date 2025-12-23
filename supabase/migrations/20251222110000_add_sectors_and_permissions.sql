-- Create departments/sectors table
CREATE TABLE IF NOT EXISTS public.sectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT DEFAULT '#3b82f6',
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create junction table for sector members
CREATE TABLE IF NOT EXISTS public.sector_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID NOT NULL REFERENCES public.sectors(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(sector_id, user_id)
);

-- Add sector_id to tickets table
ALTER TABLE public.tickets
ADD COLUMN IF NOT EXISTS sector_id UUID REFERENCES public.sectors(id);

-- Add sector_id to ticket_statuses table
ALTER TABLE public.ticket_statuses
ADD COLUMN IF NOT EXISTS sector_id UUID REFERENCES public.sectors(id);

-- Enable RLS
ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sector_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sectors
CREATE POLICY "Users can view sectors they're members of"
ON public.sectors
FOR SELECT
USING (
  auth.uid() IN (
    SELECT user_id FROM public.sector_members WHERE sector_id = sectors.id
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Analysts and admins can create sectors"
ON public.sectors
FOR INSERT
WITH CHECK (
  created_by = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('analyst', 'admin')
  )
);

CREATE POLICY "Admins can update any sector, creators can update own"
ON public.sectors
FOR UPDATE
USING (
  created_by = auth.uid() OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Admins can delete any sector, creators can delete own"
ON public.sectors
FOR DELETE
USING (
  created_by = auth.uid() OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  )
);

-- RLS Policies for sector_members
CREATE POLICY "Users can view sector members they're part of"
ON public.sector_members
FOR SELECT
USING (
  auth.uid() IN (
    SELECT user_id FROM public.sector_members sm2 WHERE sm2.sector_id = sector_members.sector_id
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Sector creator and admins can manage members"
ON public.sector_members
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sectors s WHERE s.id = sector_id AND (
      s.created_by = auth.uid() OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
      )
    )
  )
);

CREATE POLICY "Sector creator and admins can remove members"
ON public.sector_members
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.sectors s WHERE s.id = sector_id AND (
      s.created_by = auth.uid() OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
      )
    )
  )
);

-- Triggers
CREATE TRIGGER update_sectors_updated_at
BEFORE UPDATE ON public.sectors
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

-- Create indexes
CREATE INDEX idx_sector_members_sector_id ON public.sector_members(sector_id);
CREATE INDEX idx_sector_members_user_id ON public.sector_members(user_id);
CREATE INDEX idx_tickets_sector_id ON public.tickets(sector_id);
CREATE INDEX idx_ticket_statuses_sector_id ON public.ticket_statuses(sector_id);
