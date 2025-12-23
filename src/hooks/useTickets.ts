import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface TicketStatus {
  id: string;
  name: string;
  color: string;
  description: string | null;
  is_default: boolean;
  order_index: number;
}

export interface Ticket {
  id: string;
  ticket_number: number;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status_id: string | null;
  created_by: string;
  assigned_to: string | null;
  category: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  archived_at: string | null;
  expected_resolution_at: string | null;
  analyst_observation: string | null;
  first_response_at: string | null;
  resolution_started_at: string | null;
  status?: TicketStatus;
  creator?: {
    id: string;
    full_name: string;
    email: string;
    department: string | null;
  };
  assignee?: {
    id: string;
    full_name: string;
    email: string;
  } | null;
}

export function useTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const { profile, role } = useAuth();

  const fetchTickets = async () => {
    setLoading(true);
    
    let query = supabase
      .from('tickets')
      .select(`
        *,
        status:ticket_statuses(*),
        creator:profiles!tickets_created_by_fkey(id, full_name, email, department),
        assignee:profiles!tickets_assigned_to_fkey(id, full_name, email)
      `)
      .is('archived_at', null)
      .order('created_at', { ascending: false });

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
      fetchTickets();
    }
  }, [profile, role]);

  return { tickets, loading, refetch: fetchTickets };
}

export function useTicketStatuses() {
  const [statuses, setStatuses] = useState<TicketStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStatuses = async () => {
    const { data, error } = await supabase
      .from('ticket_statuses')
      .select('*')
      .order('order_index');

    if (!error && data) {
      setStatuses(data as TicketStatus[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStatuses();
  }, []);

  return { statuses, loading, refetch: fetchStatuses };
}

export async function archiveTicket(ticketId: string) {
  const { error } = await supabase
    .from('tickets')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', ticketId);

  if (error) {
    toast.error('Erro ao arquivar chamado');
    return false;
  }
  toast.success('Chamado arquivado');
  return true;
}

export async function deleteTicket(ticketId: string) {
  const { error } = await supabase
    .from('tickets')
    .delete()
    .eq('id', ticketId);

  if (error) {
    toast.error('Erro ao deletar chamado');
    return false;
  }
  toast.success('Chamado deletado');
  return true;
}

export async function reopenTicket(ticketId: string, defaultStatusId: string) {
  const { error } = await supabase
    .from('tickets')
    .update({ status_id: defaultStatusId, closed_at: null })
    .eq('id', ticketId);

  if (error) {
    toast.error('Erro ao reabrir chamado');
    return false;
  }
  toast.success('Chamado reaberto');
  return true;
}

export async function sendNotification(
  type: 'new_message' | 'status_change',
  ticketId: string,
  options?: { message?: string; new_status?: string; sender_name?: string }
) {
  try {
    await supabase.functions.invoke('send-notification', {
      body: { type, ticket_id: ticketId, ...options },
    });
  } catch (err) {
    console.error('Failed to send notification:', err);
  }
}
