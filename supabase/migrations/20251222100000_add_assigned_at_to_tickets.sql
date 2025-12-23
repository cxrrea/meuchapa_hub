-- Add assigned_at column to track when a ticket was assigned to an analyst
ALTER TABLE public.tickets
ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP WITH TIME ZONE;

-- Update existing tickets that have assigned_to set to use updated_at as assigned_at
UPDATE public.tickets
SET assigned_at = updated_at
WHERE assigned_to IS NOT NULL AND assigned_at IS NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_at ON public.tickets(assigned_at);
