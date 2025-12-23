import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Trash2, Plus, Users } from 'lucide-react';
import { toast } from 'sonner';

interface Sector {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
}

interface SectorMember {
  id: string;
  user_id: string;
  sector_id: string;
  created_at: string;
  profiles?: { full_name: string; email: string };
}

interface Profile {
  id: string;
  full_name: string;
  email: string;
}

export default function SectorManagement() {
  const { profile, role } = useAuth();
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSectorName, setNewSectorName] = useState('');
  const [newSectorDescription, setNewSectorDescription] = useState('');
  const [selectedSector, setSelectedSector] = useState<string>('');
  const [sectorMembers, setSectorMembers] = useState<SectorMember[]>([]);
  const [selectedUserToAdd, setSelectedUserToAdd] = useState<string>('');

  const fetchSectors = async () => {
    try {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from('sectors')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setSectors(data || []);
    } catch (err) {
      console.error('Erro ao carregar setores:', err);
      toast.error('Erro ao carregar setores');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllProfiles = async () => {
    try {
      const { data, error: err } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .order('full_name');

      if (err) throw err;
      setAllProfiles(data || []);
    } catch (err) {
      console.error('Erro ao carregar perfis:', err);
    }
  };

  const fetchSectorMembers = async (sectorId: string) => {
    try {
      const { data, error } = await (supabase as any)
        .from('sector_members')
        .select('*, profiles(full_name, email)')
        .eq('sector_id', sectorId);

      if (error) throw error;
      setSectorMembers(data || []);
    } catch (err) {
      console.error('Erro ao carregar membros:', err);
      toast.error('Erro ao carregar membros do setor');
    }
  };

  const createSector = async () => {
    try {
      if (!newSectorName.trim()) {
        toast.error('Nome do setor é obrigatório');
        return;
      }

      const { error } = await (supabase as any)
        .from('sectors')
        .insert({
          name: newSectorName.trim(),
          description: newSectorDescription.trim() || null,
          created_by: profile?.id,
        });

      if (error) throw error;

      toast.success(`Setor "${newSectorName}" criado com sucesso`);
      setNewSectorName('');
      setNewSectorDescription('');
      fetchSectors();
    } catch (err: any) {
      console.error('Erro ao criar setor:', err);
      if (err.code === '23505') {
        toast.error('Já existe um setor com este nome');
      } else {
        toast.error('Erro ao criar setor');
      }
    }
  };

  const deleteSector = async (sectorId: string, sectorName: string) => {
    if (!confirm(`Tem certeza que deseja deletar o setor "${sectorName}"?`)) {
      return;
    }

    try {
      const { error } = await (supabase as any)
        .from('sectors')
        .delete()
        .eq('id', sectorId);

      if (error) throw error;

      toast.success(`Setor "${sectorName}" deletado com sucesso`);
      fetchSectors();
      if (selectedSector === sectorId) {
        setSelectedSector('');
        setSectorMembers([]);
      }
    } catch (err) {
      console.error('Erro ao deletar setor:', err);
      toast.error('Erro ao deletar setor');
    }
  };

  const addMemberToSector = async () => {
    try {
      if (!selectedUserToAdd) {
        toast.error('Selecione um usuário');
        return;
      }

      const { error } = await (supabase as any)
        .from('sector_members')
        .insert({
          sector_id: selectedSector,
          user_id: selectedUserToAdd,
        });

      if (error) throw error;

      toast.success('Membro adicionado com sucesso');
      setSelectedUserToAdd('');
      fetchSectorMembers(selectedSector);
    } catch (err: any) {
      console.error('Erro ao adicionar membro:', err);
      if (err.code === '23505') {
        toast.error('Este usuário já é membro do setor');
      } else {
        toast.error('Erro ao adicionar membro');
      }
    }
  };

  const removeMemberFromSector = async (memberId: string) => {
    try {
      const { error } = await supabase
        .from('sector_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;

      toast.success('Membro removido com sucesso');
      fetchSectorMembers(selectedSector);
    } catch (err) {
      console.error('Erro ao remover membro:', err);
      toast.error('Erro ao remover membro');
    }
  };

  // Get users not yet in the selected sector
  const availableUsers = selectedSector
    ? allProfiles.filter(
        p => !sectorMembers.some(m => m.user_id === p.id)
      )
    : [];

  // Check if user is admin
  useEffect(() => {
    fetchSectors();
    fetchAllProfiles();
  }, []);

  useEffect(() => {
    if (selectedSector) {
      fetchSectorMembers(selectedSector);
    }
  }, [selectedSector]);

  if (role !== 'admin') {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Você não tem permissão para gerenciar setores. Apenas administradores podem acessar esta funcionalidade.
        </AlertDescription>
      </Alert>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Gerenciamento de Setores</h2>
        <p className="text-muted-foreground">Crie e gerencie setores/departamentos do suporte</p>
      </div>

      {/* Create New Sector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Criar Novo Setor
          </CardTitle>
          <CardDescription>Adicione um novo setor/departamento</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Nome do Setor</label>
            <Input
              placeholder="Ex: Suporte Técnico"
              value={newSectorName}
              onChange={(e) => setNewSectorName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Descrição (Opcional)</label>
            <Input
              placeholder="Ex: Equipe responsável por suporte técnico"
              value={newSectorDescription}
              onChange={(e) => setNewSectorDescription(e.target.value)}
            />
          </div>
          <Button onClick={createSector} className="w-full">
            Criar Setor
          </Button>
        </CardContent>
      </Card>

      {/* List Sectors */}
      <Card>
        <CardHeader>
          <CardTitle>Setores Existentes</CardTitle>
          <CardDescription>Gerencie os setores criados</CardDescription>
        </CardHeader>
        <CardContent>
          {sectors.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">Nenhum setor criado ainda</p>
          ) : (
            <div className="space-y-3">
              {sectors.map((sector) => (
                <div
                  key={sector.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent"
                >
                  <div className="flex-1">
                    <h3 className="font-medium">{sector.name}</h3>
                    {sector.description && (
                      <p className="text-sm text-muted-foreground">{sector.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedSector(sector.id)}
                        >
                          <Users className="h-4 w-4 mr-2" />
                          Membros
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>Membros de "{sector.name}"</DialogTitle>
                          <DialogDescription>
                            Gerencie os membros deste setor
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          {/* Add member */}
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Adicionar Membro</label>
                            <Select value={selectedUserToAdd} onValueChange={setSelectedUserToAdd}>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione um usuário" />
                              </SelectTrigger>
                              <SelectContent>
                                {availableUsers.map((user) => (
                                  <SelectItem key={user.id} value={user.id}>
                                    {user.full_name} ({user.email})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              onClick={addMemberToSector}
                              size="sm"
                              className="w-full"
                              disabled={!selectedUserToAdd}
                            >
                              Adicionar
                            </Button>
                          </div>

                          {/* List members */}
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Membros Atuais</label>
                            {sectorMembers.length === 0 ? (
                              <p className="text-sm text-muted-foreground">Nenhum membro</p>
                            ) : (
                              <div className="space-y-2 max-h-48 overflow-y-auto">
                                {sectorMembers.map((member) => (
                                  <div
                                    key={member.id}
                                    className="flex items-center justify-between p-2 bg-muted rounded"
                                  >
                                    <div className="text-sm">
                                      <p className="font-medium">
                                        {member.profiles?.full_name}
                                      </p>
                                      <p className="text-muted-foreground text-xs">
                                        {member.profiles?.email}
                                      </p>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => removeMemberFromSector(member.id)}
                                    >
                                      <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteSector(sector.id, sector.name)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
