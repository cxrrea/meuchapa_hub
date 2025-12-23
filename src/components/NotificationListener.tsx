import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { playNotificationSound, startTabAlert } from '@/hooks/useUnreadMessages';

export default function NotificationListener() {
  const { profile, isStaff } = useAuth();
  const unreadCountsRef = useRef<{ [ticketId: string]: number }>({});

  useEffect(() => {
    if (!profile) return;

    // Load stored unread counts
    const storageKey = `unread_messages_${profile.id}`;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      unreadCountsRef.current = JSON.parse(stored);
    }

    const channel = supabase
      .channel('global-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ticket_messages',
        },
        async (payload: any) => {
          const newMessage = payload.new;
          
          // Don't notify for own messages
          if (newMessage.sender_id === profile.id) return;

          // Check if user has access to this ticket
          const { data: ticket } = await supabase
            .from('tickets')
            .select('created_by, assigned_to')
            .eq('id', newMessage.ticket_id)
            .single();

          if (!ticket) return;

          // Users only see their own tickets, staff sees all
          const hasAccess = isStaff || ticket.created_by === profile.id;
          if (!hasAccess) return;

          // Update unread count in localStorage
          const currentCounts = { ...unreadCountsRef.current };
          currentCounts[newMessage.ticket_id] = (currentCounts[newMessage.ticket_id] || 0) + 1;
          unreadCountsRef.current = currentCounts;
          localStorage.setItem(storageKey, JSON.stringify(currentCounts));

          // Dispatch storage event to update other components
          window.dispatchEvent(new StorageEvent('storage', {
            key: storageKey,
            newValue: JSON.stringify(currentCounts)
          }));

          // Check if user is currently viewing this ticket
          const isViewingTicket = window.location.pathname === `/ticket/${newMessage.ticket_id}`;
          
          if (!isViewingTicket && document.hidden) {
            playNotificationSound();
            startTabAlert('Nova mensagem!');
          } else if (!isViewingTicket) {
            // Play sound even if tab is focused but not viewing the ticket
            playNotificationSound();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile, isStaff]);

  return null;
}
