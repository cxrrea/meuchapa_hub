import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTicketStatuses, Ticket, archiveTicket, deleteTicket, reopenTicket } from '@/hooks/useTickets';
import { useUnreadMessages, playNotificationSound, startTabAlert, stopTabAlert } from '@/hooks/useUnreadMessages';
import { supabase } from '@/integrations/supabase/client';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ArrowLeft, Send, Paperclip, Loader2, Clock, User, Archive, Trash2, RotateCcw, X, Download, FileText, Image, CalendarIcon, MessageSquare, Edit2, Check, Building } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

interface Attachment {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  message_id: string | null;
}

interface Message {
  id: string;
  ticket_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender?: {
    id: string;
    full_name: string;
  };
  attachments?: Attachment[];
}

const priorityConfig = {
  low: { label: 'Baixa', className: 'bg-muted text-muted-foreground' },
  medium: { label: 'Média', className: 'bg-info/10 text-info' },
  high: { label: 'Alta', className: 'bg-warning/10 text-warning' },
  critical: { label: 'Crítica', className: 'bg-destructive/10 text-destructive' },
};

export default function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile, isStaff, role } = useAuth();
  const { statuses } = useTicketStatuses();
  const { markAsRead, incrementUnread } = useUnreadMessages();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [editingObservation, setEditingObservation] = useState(false);
  const [observationText, setObservationText] = useState('');
  const [sectors, setSectors] = useState<any[]>([]);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [selectedNewSector, setSelectedNewSector] = useState<string>('');
  const [transferring, setTransferring] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastMessageCountRef = useRef<number>(0);

  const fetchTicket = async () => {
    const { data, error } = await supabase
      .from('tickets')
      .select(`
        *,
        status:ticket_statuses(*),
        creator:profiles!tickets_created_by_fkey(id, full_name, email, department),
        assignee:profiles!tickets_assigned_to_fkey(id, full_name, email)
      `)
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      toast.error('Chamado não encontrado');
      navigate('/');
      return;
    }

    setTicket(data as unknown as Ticket);
    setObservationText(data.analyst_observation || '');
    setLoading(false);
  };

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('ticket_messages')
      .select(`
        *,
        sender:profiles!ticket_messages_sender_id_fkey(id, full_name)
      `)
      .eq('ticket_id', id)
      .order('created_at', { ascending: true });

    if (data) {
      setMessages(data as unknown as Message[]);
    }
  };

  const fetchAttachments = async () => {
    const { data } = await supabase
      .from('ticket_attachments')
      .select('*')
      .eq('ticket_id', id);

    if (data) {
      setAttachments(data as Attachment[]);
    }
  };

  const fetchSectors = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('sectors')
        .select('id, name')
        .order('name');

      if (!error) {
        setSectors(data || []);
      }
    } catch (err) {
      console.error('Erro ao carregar setores:', err);
    }
  };

  const handleTransferSector = async () => {
    if (!selectedNewSector || !ticket) {
      toast.error('Selecione um setor');
      return;
    }

    if (selectedNewSector === ticket.sector_id) {
      toast.error('O chamado já está neste setor');
      setTransferDialogOpen(false);
      return;
    }

    setTransferring(true);
    try {
      const { error } = await supabase
        .from('tickets')
        .update({ sector_id: selectedNewSector })
        .eq('id', id);

      if (error) throw error;

      toast.success('Chamado transferido com sucesso');
      setTransferDialogOpen(false);
      fetchTicket();
      setSelectedNewSector('');
    } catch (err) {
      console.error('Erro ao transferir chamado:', err);
      toast.error('Erro ao transferir chamado');
    } finally {
      setTransferring(false);
    }
  };

  // Mark messages as read when entering the ticket
  useEffect(() => {
    if (id) {
      markAsRead(id);
      stopTabAlert();
    }
  }, [id, markAsRead]);

  useEffect(() => {
    fetchTicket();
    fetchMessages();
    fetchAttachments();
    fetchSectors();

    const channel = supabase
      .channel(`ticket-messages-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ticket_messages',
          filter: `ticket_id=eq.${id}`,
        },
        (payload: any) => {
          console.log('New message received:', payload);
          fetchMessages();
          
          // Notify if message is from another user and tab is not focused
          if (payload.new?.sender_id !== profile?.id) {
            if (document.hidden) {
              playNotificationSound();
              startTabAlert('Nova mensagem!');
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket_attachments',
          filter: `ticket_id=eq.${id}`,
        },
        () => {
          fetchAttachments();
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, profile?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setPendingFiles(prev => [...prev, ...files]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async (messageId: string) => {
    for (const file of pendingFiles) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(fileName, file);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        continue;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('attachments')
        .getPublicUrl(fileName);

      await supabase.from('ticket_attachments').insert({
        ticket_id: id,
        message_id: messageId,
        uploaded_by: profile!.id,
        file_name: file.name,
        file_url: publicUrl,
        file_type: file.type,
        file_size: file.size,
      });
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() && pendingFiles.length === 0) return;

    setSending(true);
    const messageContent = newMessage.trim() || '📎 Anexo enviado';

    const { data: msgData, error } = await supabase
      .from('ticket_messages')
      .insert({
        ticket_id: id,
        sender_id: profile!.id,
        content: messageContent,
      })
      .select()
      .single();

    if (error) {
      toast.error('Erro ao enviar mensagem');
      setSending(false);
      return;
    }

    // Track first response time for staff
    if (isStaff && ticket && !ticket.first_response_at) {
      await supabase
        .from('tickets')
        .update({ first_response_at: new Date().toISOString() })
        .eq('id', id);
      fetchTicket();
    }

    // Immediately fetch messages after sending
    await fetchMessages();

    if (pendingFiles.length > 0 && msgData) {
      await uploadFiles(msgData.id);
      setPendingFiles([]);
      await fetchAttachments();
    }

    setNewMessage('');
    setSending(false);
  };

  const handleStatusChange = async (statusId: string) => {
    const selectedStatus = statuses.find(s => s.id === statusId);
    const isClosingStatus = selectedStatus?.name?.toLowerCase().includes('fechado') || 
                            selectedStatus?.name?.toLowerCase().includes('closed') ||
                            selectedStatus?.name?.toLowerCase().includes('resolvido');
    
    const updateData: Record<string, any> = { status_id: statusId };
    
    // Set closed_at when marking as resolved/closed
    if (isClosingStatus && !ticket?.closed_at) {
      updateData.closed_at = new Date().toISOString();
    } else if (!isClosingStatus && ticket?.closed_at) {
      // Clear closed_at if reopening
      updateData.closed_at = null;
    }

    const { error } = await supabase
      .from('tickets')
      .update(updateData)
      .eq('id', id);

    if (error) {
      toast.error('Erro ao atualizar status');
    } else {
      toast.success('Status atualizado');
      fetchTicket();
    }
  };

  const handleAssign = async () => {
    const { error } = await supabase
      .from('tickets')
      .update({ assigned_to: profile!.id })
      .eq('id', id);

    if (error) {
      toast.error('Erro ao assumir chamado');
    } else {
      toast.success('Chamado assumido');
      fetchTicket();
    }
  };

  const handleArchive = async () => {
    const success = await archiveTicket(id!);
    if (success) {
      navigate('/');
    }
  };

  const handleDelete = async () => {
    const success = await deleteTicket(id!);
    if (success) {
      navigate('/');
    }
  };

  const handleReopen = async () => {
    const defaultStatus = statuses.find(s => s.is_default) || statuses[0];
    if (defaultStatus) {
      const success = await reopenTicket(id!, defaultStatus.id);
      if (success) {
        fetchTicket();
      }
    }
  };

  const handleSaveObservation = async () => {
    const { error } = await supabase
      .from('tickets')
      .update({ analyst_observation: observationText.trim() || null })
      .eq('id', id);
    
    if (error) {
      toast.error('Erro ao salvar observação');
    } else {
      toast.success('Observação salva');
      setEditingObservation(false);
      fetchTicket();
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (type: string | null) => {
    if (type?.startsWith('image/')) return <Image className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  const isImage = (type: string | null) => type?.startsWith('image/');

  const getMessageAttachments = (messageId: string) => {
    return attachments.filter(a => a.message_id === messageId);
  };

  const isClosed = ticket?.status?.name?.toLowerCase().includes('fechado') || 
                   ticket?.status?.name?.toLowerCase().includes('closed') ||
                   ticket?.status?.name?.toLowerCase().includes('resolvido');

  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!ticket) return null;

  const priority = priorityConfig[ticket.priority];

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>

          {/* Staff Actions */}
          {isStaff && (
            <div className="flex items-center gap-2 flex-wrap">
              {isClosed && (
                <Button variant="outline" size="sm" onClick={handleReopen}>
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Reabrir
                </Button>
              )}

              {/* Transfer Sector Dialog */}
              {role === 'analyst' || role === 'admin' ? (
                <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Building className="h-4 w-4 mr-1" />
                      Transferir Setor
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Transferir Chamado para Outro Setor</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Novo Setor</label>
                        <Select value={selectedNewSector} onValueChange={setSelectedNewSector}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o setor de destino" />
                          </SelectTrigger>
                          <SelectContent>
                            {sectors.filter(s => s.id !== ticket?.sector_id).map((sector) => (
                              <SelectItem key={sector.id} value={sector.id}>
                                {sector.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setTransferDialogOpen(false)}
                        >
                          Cancelar
                        </Button>
                        <Button
                          onClick={handleTransferSector}
                          disabled={transferring || !selectedNewSector}
                        >
                          {transferring && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                          Transferir
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              ) : null}
              
              <Button variant="outline" size="sm" onClick={handleArchive}>
                <Archive className="h-4 w-4 mr-1" />
                Arquivar
              </Button>

              {role === 'admin' && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Trash2 className="h-4 w-4 mr-1" />
                      Excluir
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir chamado?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação não pode ser desfeita. O chamado e todas as suas mensagens serão permanentemente excluídos.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          )}

          {/* Client Reopen Button */}
          {!isStaff && isClosed && (
            <Button variant="outline" size="sm" onClick={handleReopen}>
              <RotateCcw className="h-4 w-4 mr-1" />
              Reabrir chamado
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-mono text-muted-foreground">
                        #{ticket.ticket_number}
                      </span>
                      {ticket.status && (
                        <Badge
                          variant="outline"
                          style={{
                            backgroundColor: `${ticket.status.color}15`,
                            borderColor: ticket.status.color,
                            color: ticket.status.color,
                          }}
                        >
                          {ticket.status.name}
                        </Badge>
                      )}
                      <Badge variant="outline" className={priority.className}>
                        {priority.label}
                      </Badge>
                    </div>
                    <CardTitle className="text-xl">{ticket.title}</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-foreground whitespace-pre-wrap">{ticket.description}</p>
                
                {/* Ticket Attachments (created with ticket) */}
                {attachments.filter(a => a.message_id === null).length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm font-medium mb-2">Anexos do Chamado</p>
                    <div className="flex flex-wrap gap-2">
                      {attachments.filter(a => a.message_id === null).map((att) => (
                        <a
                          key={att.id}
                          href={att.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50 hover:bg-secondary text-sm transition-colors"
                        >
                          {isImage(att.file_type) ? (
                            <Image className="h-4 w-4 flex-shrink-0" />
                          ) : (
                            <FileText className="h-4 w-4 flex-shrink-0" />
                          )}
                          <span className="truncate max-w-[200px]">{att.file_name}</span>
                          <Download className="h-3 w-3 flex-shrink-0 opacity-50" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="flex items-center gap-4 mt-4 pt-4 border-t text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {format(new Date(ticket.created_at), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                  </div>
                  {ticket.category && (
                    <span className="px-2 py-1 bg-secondary rounded-full text-xs">
                      {ticket.category}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Analyst Observation - Highlighted */}
            {ticket.analyst_observation && (
              <Card className="border-primary/50 bg-primary/5">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    <CardTitle className="text-base text-primary">Observação do Analista</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-foreground whitespace-pre-wrap">{ticket.analyst_observation}</p>
                </CardContent>
              </Card>
            )}

            {/* Chat */}
            <Card className="flex flex-col" style={{ height: '450px' }}>
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-base">Conversas</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    Nenhuma mensagem ainda
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isOwn = msg.sender_id === profile?.id;
                    const msgAttachments = getMessageAttachments(msg.id);
                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}
                      >
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          <AvatarFallback className={`text-xs ${isOwn ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>
                            {msg.sender ? getInitials(msg.sender.full_name) : 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium">
                              {msg.sender?.full_name}
                            </span>
                          </div>
                          <div
                            className={`rounded-lg px-3 py-2 text-sm ${
                              isOwn
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-secondary'
                            }`}
                          >
                            {msg.content}
                          </div>
                          
                          {/* Message Attachments */}
                          {msgAttachments.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {msgAttachments.map((att) => (
                                <div
                                  key={att.id}
                                  className="flex items-center gap-2 bg-secondary/50 rounded-lg p-2 text-sm"
                                >
                                  {isImage(att.file_type) ? (
                                    <a
                                      href={att.file_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="block max-w-[200px]"
                                    >
                                      <img
                                        src={att.file_url}
                                        alt={att.file_name}
                                        className="rounded max-h-32 object-cover"
                                      />
                                    </a>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      {getFileIcon(att.file_type)}
                                      <span className="truncate max-w-[150px]">{att.file_name}</span>
                                    </div>
                                  )}
                                  <a
                                    href={att.file_url}
                                    download={att.file_name}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1 hover:bg-secondary rounded"
                                  >
                                    <Download className="h-3 w-3" />
                                  </a>
                                </div>
                              ))}
                            </div>
                          )}
                          
                          <span className="text-[10px] text-muted-foreground mt-1 block">
                            {format(new Date(msg.created_at), 'HH:mm')}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </CardContent>
              
              {/* Pending Files Preview */}
              {pendingFiles.length > 0 && (
                <div className="px-4 py-2 border-t bg-muted/30">
                  <div className="flex flex-wrap gap-2">
                    {pendingFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 bg-primary/10 rounded-lg px-2 py-1 text-sm"
                      >
                        {getFileIcon(file.type)}
                        <span className="truncate max-w-[120px]">{file.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatFileSize(file.size)}
                        </span>
                        <button
                          onClick={() => removePendingFile(index)}
                          className="p-0.5 hover:bg-destructive/20 rounded"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="p-4 border-t">
                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    className="hidden"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending}
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <Input
                    placeholder="Digite sua mensagem..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    className="flex-1"
                  />
                  <Button type="submit" disabled={sending || (!newMessage.trim() && pendingFiles.length === 0)}>
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </form>
              </div>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Detalhes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground">Solicitante</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                        {ticket.creator ? getInitials(ticket.creator.full_name) : 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{ticket.creator?.full_name}</span>
                  </div>
                  {ticket.creator?.department && (
                    <span className="text-xs text-muted-foreground ml-8">
                      {ticket.creator.department}
                    </span>
                  )}
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Responsável</label>
                  {ticket.assignee ? (
                    <div className="flex items-center gap-2 mt-1">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                          {getInitials(ticket.assignee.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{ticket.assignee.full_name}</span>
                    </div>
                  ) : (
                    <div className="mt-1">
                      {isStaff ? (
                        <Button variant="outline" size="sm" onClick={handleAssign}>
                          <User className="h-3 w-3 mr-1" />
                          Assumir chamado
                        </Button>
                      ) : (
                        <span className="text-sm text-muted-foreground">Não atribuído</span>
                      )}
                    </div>
                  )}
                </div>

                {isStaff && (
                  <div>
                    <label className="text-xs text-muted-foreground">Status</label>
                    <Select
                      value={ticket.status_id || ''}
                      onValueChange={handleStatusChange}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statuses.map((status) => (
                          <SelectItem key={status.id} value={status.id}>
                            <div className="flex items-center gap-2">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: status.color }}
                              />
                              {status.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Expected Resolution Date - Editable by Staff */}
                <div>
                  <label className="text-xs text-muted-foreground">Previsão de Resolução</label>
                  {isStaff ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal mt-1",
                            !ticket.expected_resolution_at && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {ticket.expected_resolution_at
                            ? format(new Date(ticket.expected_resolution_at), "dd/MM/yyyy", { locale: ptBR })
                            : "Selecionar data"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={ticket.expected_resolution_at ? new Date(ticket.expected_resolution_at) : undefined}
                          onSelect={async (date) => {
                            const { error } = await supabase
                              .from('tickets')
                              .update({ expected_resolution_at: date?.toISOString() || null })
                              .eq('id', id);
                            if (error) {
                              toast.error('Erro ao atualizar previsão');
                            } else {
                              toast.success('Previsão atualizada');
                              fetchTicket();
                            }
                          }}
                          disabled={(date) => date < new Date()}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                          locale={ptBR}
                        />
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <div className="mt-1 text-sm">
                      {ticket.expected_resolution_at ? (
                        <div className="flex items-center gap-2 text-primary">
                          <CalendarIcon className="h-4 w-4" />
                          {format(new Date(ticket.expected_resolution_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Não definida</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Analyst Observation - Staff only editing */}
                {isStaff && (
                  <div>
                    <label className="text-xs text-muted-foreground flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      Observação em Destaque
                    </label>
                    {editingObservation ? (
                      <div className="mt-1 space-y-2">
                        <Textarea
                          value={observationText}
                          onChange={(e) => setObservationText(e.target.value)}
                          placeholder="Adicione uma observação importante para o usuário..."
                          className="min-h-[80px] text-sm"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={handleSaveObservation}>
                            <Check className="h-3 w-3 mr-1" />
                            Salvar
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => {
                              setEditingObservation(false);
                              setObservationText(ticket.analyst_observation || '');
                            }}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full justify-start"
                          onClick={() => setEditingObservation(true)}
                        >
                          <Edit2 className="h-3 w-3 mr-1" />
                          {ticket.analyst_observation ? 'Editar observação' : 'Adicionar observação'}
                        </Button>
                        {ticket.analyst_observation && (
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-3">
                            {ticket.analyst_observation}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
