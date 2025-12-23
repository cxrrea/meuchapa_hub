import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTicketStatuses } from '@/hooks/useTickets';
import { supabase } from '@/integrations/supabase/client';
import AppLayout from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, Send, Paperclip, X, FileText, Image, AlertCircle, Clock } from 'lucide-react';

// Default fallback categories
const DEFAULT_CATEGORIES = [
  'Hardware',
  'Software',
  'Rede',
  'Email',
  'Acesso/Permissões',
  'Impressora',
  'Outros',
];

// SLA targets in minutes
const SLA_TARGETS = {
  response: {
    urgent: 30,    // 30 minutes
    high: 60,      // 1 hour
    medium: 240,   // 4 hours
    low: 480,      // 8 hours
    critical: 30,  // 30 minutes
  },
  resolution: {
    urgent: 240,   // 4 hours
    high: 480,     // 8 hours
    medium: 1440,  // 24 hours
    low: 2880,     // 48 hours
    critical: 240, // 4 hours
  }
};

export default function NewTicket() {
  const navigate = useNavigate();
  const { profile, role } = useAuth();
  const { statuses } = useTicketStatuses();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [sectors, setSectors] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatMinutes = (minutes: number): string => {
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hours < 24) return `${hours}h ${mins}min`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  };

  useEffect(() => {
    fetchSectors();
  }, []);

  useEffect(() => {
    if (sectorId) {
      fetchCategories(sectorId);
    }
  }, [sectorId]);

  const fetchSectors = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('sectors')
        .select('id, name')
        .order('name');

      if (!error) {
        setSectors(data || []);
        // Set first sector as default if available
        if (data && data.length > 0) {
          setSectorId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar setores:', err);
    }
  };

  const fetchCategories = async (sectorId: string) => {
    try {
      const { data, error } = await (supabase as any)
        .from('sector_categories')
        .select('category_name')
        .eq('sector_id', sectorId)
        .order('category_name');

      if (!error && data && data.length > 0) {
        setCategories(data.map(c => c.category_name));
      } else {
        // Fallback to default categories if none found
        setCategories(DEFAULT_CATEGORIES);
      }
    } catch (err) {
      console.error('Erro ao carregar categorias:', err);
      setCategories(DEFAULT_CATEGORIES);
    }
  };

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

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <Image className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  const uploadFiles = async (ticketId: string, userId: string) => {
    const uploadedFiles = [];
    const failedFiles = [];

    for (const file of pendingFiles) {
      try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${ticketId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('attachments')
          .upload(fileName, file);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          failedFiles.push(file.name);
          continue;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('attachments')
          .getPublicUrl(fileName);

        const { error: dbError } = await supabase.from('ticket_attachments').insert({
          ticket_id: ticketId,
          message_id: null,
          uploaded_by: userId,
          file_name: file.name,
          file_url: publicUrl,
          file_type: file.type,
          file_size: file.size,
        });

        if (!dbError) {
          uploadedFiles.push(file.name);
        } else {
          console.error('Database error:', dbError);
          failedFiles.push(file.name);
        }
      } catch (err) {
        console.error('Upload exception:', err);
        failedFiles.push(file.name);
      }
    }

    return { uploadedFiles, failedFiles };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim() || !description.trim()) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    if (!sectorId) {
      toast.error('Selecione um setor');
      return;
    }

    setLoading(true);

    const openStatus = statuses.find(s => s.name === 'Aberto');

    const { data, error } = await supabase.from('tickets').insert({
      title: title.trim(),
      description: description.trim(),
      category: category || null,
      priority,
      sector_id: sectorId,
      created_by: profile!.id,
      status_id: openStatus?.id,
    }).select('id').single();

    if (error) {
      toast.error('Erro ao criar chamado');
      console.error(error);
      setLoading(false);
      return;
    }

    // Upload attachments if any
    if (pendingFiles.length > 0 && data) {
      const { uploadedFiles, failedFiles } = await uploadFiles(data.id, profile!.id);
      
      if (uploadedFiles.length > 0) {
        toast.success(`Chamado criado com ${uploadedFiles.length} arquivo(s) anexado(s)!`);
      }
      
      if (failedFiles.length > 0) {
        toast.warning(`Chamado criado, mas ${failedFiles.length} arquivo(s) não foram anexados. Tente novamente na conversa.`);
      }
    } else if (pendingFiles.length === 0) {
      toast.success('Chamado criado com sucesso!');
    }

    navigate('/');
    setLoading(false);
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto animate-fade-in">
        <Button
          variant="ghost"
          className="mb-4"
          onClick={() => navigate('/')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Novo Chamado</CardTitle>
            <CardDescription>
              Descreva seu problema ou solicitação para o time de T.I
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Título *</Label>
                <Input
                  id="title"
                  placeholder="Resumo do problema"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={100}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição *</Label>
                <Textarea
                  id="description"
                  placeholder="Descreva detalhadamente o problema ou solicitação..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  maxLength={2000}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sector">Setor *</Label>
                  <Select value={sectorId} onValueChange={setSectorId}>
                    <SelectTrigger id="sector">
                      <SelectValue placeholder="Selecione um setor" />
                    </SelectTrigger>
                    <SelectContent>
                      {sectors.map((sector) => (
                        <SelectItem key={sector.id} value={sector.id}>
                          {sector.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Categoria</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="priority">Prioridade</Label>
                  <Select 
                    value={priority} 
                    onValueChange={(v) => setPriority(v as typeof priority)}
                  >
                    <SelectTrigger id="priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Baixa</SelectItem>
                      <SelectItem value="medium">Média</SelectItem>
                      <SelectItem value="high">Alta</SelectItem>
                      <SelectItem value="critical">Crítica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* SLA Information */}
              <Alert>
                <Clock className="h-4 w-4" />
                <AlertDescription className="ml-2">
                  <div className="font-semibold text-sm mb-2">
                    SLA para Prioridade: {priority === 'low' ? 'Baixa' : priority === 'medium' ? 'Média' : priority === 'high' ? 'Alta' : 'Crítica'}
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="font-medium">Resposta:</span> {formatMinutes(SLA_TARGETS.response[priority])}
                    </div>
                    <div>
                      <span className="font-medium">Resolução:</span> {formatMinutes(SLA_TARGETS.resolution[priority])}
                    </div>
                  </div>
                </AlertDescription>
              </Alert>

              {/* File attachments */}
              <div className="space-y-2">
                <Label>Anexos</Label>
                <div className="space-y-3">
                  {pendingFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {pendingFiles.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2 text-sm"
                        >
                          {getFileIcon(file.type)}
                          <span className="truncate max-w-[150px]">{file.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatFileSize(file.size)}
                          </span>
                          <button
                            type="button"
                            onClick={() => removePendingFile(index)}
                            className="p-0.5 hover:bg-destructive/20 rounded"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  
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
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-dashed"
                  >
                    <Paperclip className="h-4 w-4 mr-2" />
                    Adicionar Anexo
                  </Button>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/')}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="hero"
                  disabled={loading}
                  className="flex-1"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Enviar Chamado
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
