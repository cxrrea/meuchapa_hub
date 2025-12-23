-- Add metrics columns to tickets table for time tracking
ALTER TABLE public.tickets 
ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS resolution_started_at TIMESTAMP WITH TIME ZONE;

-- Create table for detailed ticket activity metrics
CREATE TABLE IF NOT EXISTS public.ticket_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  analyst_id UUID REFERENCES public.profiles(id),
  response_time_minutes INTEGER,
  resolution_time_minutes INTEGER,
  interaction_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ticket_metrics ENABLE ROW LEVEL SECURITY;

-- RLS policies for ticket_metrics
CREATE POLICY "Staff can view all metrics"
ON public.ticket_metrics
FOR SELECT
USING (is_staff(auth.uid()));

CREATE POLICY "Staff can insert metrics"
ON public.ticket_metrics
FOR INSERT
WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can update metrics"
ON public.ticket_metrics
FOR UPDATE
USING (is_staff(auth.uid()));

-- Trigger to update updated_at
CREATE TRIGGER update_ticket_metrics_updated_at
BEFORE UPDATE ON public.ticket_metrics
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();