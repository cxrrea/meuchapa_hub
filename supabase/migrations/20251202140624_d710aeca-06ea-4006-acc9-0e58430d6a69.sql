-- Add expected resolution date column to tickets
ALTER TABLE public.tickets 
ADD COLUMN expected_resolution_at timestamp with time zone;