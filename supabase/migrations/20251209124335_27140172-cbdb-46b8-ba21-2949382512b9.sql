-- Fix: Restrict profile visibility to own profile or staff members
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Create new policy: users can view own profile, staff can view all, 
-- and users can view profiles of people involved in their tickets
CREATE POLICY "Users can view relevant profiles" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id 
    OR is_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM tickets t
      WHERE (t.created_by = auth.uid() OR t.assigned_to = auth.uid())
      AND (t.created_by = profiles.id OR t.assigned_to = profiles.id)
    )
  );