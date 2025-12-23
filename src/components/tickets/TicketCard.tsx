import { Ticket } from '@/hooks/useTickets';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Clock, User, MessageCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TicketCardProps {
  ticket: Ticket;
  onClick: () => void;
  unreadCount?: number;
}

const priorityConfig = {
  low: { label: 'Baixa', className: 'bg-muted text-muted-foreground' },
  medium: { label: 'Média', className: 'bg-info/10 text-info' },
  high: { label: 'Alta', className: 'bg-warning/10 text-warning' },
  critical: { label: 'Crítica', className: 'bg-destructive/10 text-destructive' },
};

export default function TicketCard({ ticket, onClick, unreadCount = 0 }: TicketCardProps) {
  const priority = priorityConfig[ticket.priority];
  
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Card 
      className={`cursor-pointer hover:shadow-md transition-all hover:border-primary/20 group relative ${unreadCount > 0 ? 'border-primary/50 bg-primary/5' : ''}`}
      onClick={onClick}
    >
      {unreadCount > 0 && (
        <div className="absolute -top-2 -right-2 flex items-center justify-center min-w-[24px] h-6 px-2 bg-destructive text-destructive-foreground text-xs font-bold rounded-full animate-pulse">
          <MessageCircle className="h-3 w-3 mr-1" />
          {unreadCount}
        </div>
      )}
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono text-muted-foreground">
                #{ticket.ticket_number}
              </span>
              {ticket.status && (
                <Badge 
                  variant="outline"
                  style={{ 
                    backgroundColor: `${ticket.status.color}15`,
                    borderColor: ticket.status.color,
                    color: ticket.status.color 
                  }}
                >
                  {ticket.status.name}
                </Badge>
              )}
              <Badge variant="outline" className={priority.className}>
                {priority.label}
              </Badge>
            </div>
            
            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
              {ticket.title}
            </h3>
            
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {ticket.description}
            </p>

            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(new Date(ticket.created_at), {
                  addSuffix: true,
                  locale: ptBR,
                })}
              </div>
              {ticket.category && (
                <span className="px-2 py-0.5 bg-secondary rounded-full">
                  {ticket.category}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                {ticket.creator ? getInitials(ticket.creator.full_name) : 'U'}
              </AvatarFallback>
            </Avatar>
            {ticket.assignee && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <User className="h-3 w-3" />
                <span className="truncate max-w-[80px]">{ticket.assignee.full_name}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
