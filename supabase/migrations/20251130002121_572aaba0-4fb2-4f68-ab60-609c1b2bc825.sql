-- Create app_role enum type
CREATE TYPE public.app_role AS ENUM ('admin', 'analyst', 'user');

-- Create user_roles table for secure role management
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to check if user is analyst or admin
CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'analyst')
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles" ON public.user_roles
FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Add archived_at column to tickets
ALTER TABLE public.tickets ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Migrate existing roles from profiles to user_roles
INSERT INTO public.user_roles (user_id, role)
SELECT id, role::text::app_role FROM public.profiles WHERE role IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- Update tickets RLS policies to use has_role function
DROP POLICY IF EXISTS "Users can view own tickets" ON public.tickets;
DROP POLICY IF EXISTS "Analysts can update tickets" ON public.tickets;

CREATE POLICY "Users can view own tickets" ON public.tickets
FOR SELECT USING (
  created_by = auth.uid() OR public.is_staff(auth.uid())
);

CREATE POLICY "Staff can update tickets" ON public.tickets
FOR UPDATE USING (
  created_by = auth.uid() OR public.is_staff(auth.uid())
);

CREATE POLICY "Staff can delete tickets" ON public.tickets
FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Update ticket_messages RLS to use has_role
DROP POLICY IF EXISTS "Users can view messages of their tickets" ON public.ticket_messages;
DROP POLICY IF EXISTS "Users can send messages" ON public.ticket_messages;

CREATE POLICY "Users can view messages of their tickets" ON public.ticket_messages
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM tickets
    WHERE tickets.id = ticket_messages.ticket_id
    AND (tickets.created_by = auth.uid() OR public.is_staff(auth.uid()))
  )
);

CREATE POLICY "Users can send messages" ON public.ticket_messages
FOR INSERT WITH CHECK (
  sender_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM tickets
    WHERE tickets.id = ticket_messages.ticket_id
    AND (tickets.created_by = auth.uid() OR public.is_staff(auth.uid()))
  )
);

-- Update ticket_attachments RLS
DROP POLICY IF EXISTS "Users can view attachments" ON public.ticket_attachments;
DROP POLICY IF EXISTS "Users can upload attachments" ON public.ticket_attachments;

CREATE POLICY "Users can view attachments" ON public.ticket_attachments
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM tickets
    WHERE tickets.id = ticket_attachments.ticket_id
    AND (tickets.created_by = auth.uid() OR public.is_staff(auth.uid()))
  )
);

CREATE POLICY "Users can upload attachments" ON public.ticket_attachments
FOR INSERT WITH CHECK (
  uploaded_by = auth.uid() AND
  EXISTS (
    SELECT 1 FROM tickets
    WHERE tickets.id = ticket_attachments.ticket_id
    AND (tickets.created_by = auth.uid() OR public.is_staff(auth.uid()))
  )
);

-- Update ticket_statuses RLS
DROP POLICY IF EXISTS "Analysts can manage statuses" ON public.ticket_statuses;

CREATE POLICY "Staff can manage statuses" ON public.ticket_statuses
FOR ALL USING (public.is_staff(auth.uid()));

-- Update profiles RLS - restrict what users can update
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Remove role column from profiles (it's now in user_roles)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS role;

-- Create function to handle new user role assignment
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for new users
CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();