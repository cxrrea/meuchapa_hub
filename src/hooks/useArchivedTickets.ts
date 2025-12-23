import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Ticket } from './useTickets';

export function useArchivedTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const { profile, role } = useAuth();

  const fetchArchivedTickets = async () => {
    setLoading(true);
    
    let query = supabase
      .from('tickets')
      .select(`
        *,
        status:ticket_statuses(*),
        creator:profiles!tickets_created_by_fkey(id, full_name, email, department),
        assignee:profiles!tickets_assigned_to_fkey(id, full_name, email)
      `)
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false });

    if (role === 'user' && profile) {
      query = query.eq('created_by', profile.id);
    }

    const { data, error } = await query;

    if (!error && data) {
      setTickets(data as unknown as Ticket[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (profile) {
      fetchArchivedTickets();
    }
  }, [profile, role]);

  return { tickets, loading, refetch: fetchArchivedTickets };
}
