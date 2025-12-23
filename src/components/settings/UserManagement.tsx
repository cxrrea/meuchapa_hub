import { useState, useEffect } from 'react';
import { useUserManagement } from '@/hooks/useUserManagement';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Pencil, Key, Mail, Shield, Eye, EyeOff, Search, Building, AlertCircle } from 'lucide-react';

interface EditingUser {
  id: string;
  email: string;
  full_name: string;
  department: string | null;
  roles: string[];
  sector_id?: string | null;
}

type DialogType = 'profile' | 'email' | 'password' | 'role' | 'sector' | null;

export default function UserManagement() {
  const { users, loading, error, refetch, updateUserEmail, updateUserPassword, updateUserProfile, updateUserRole } = useUserManagement();
  const { role: currentUserRole, user: currentUser } = useAuth();
  const isAdmin = currentUserRole === 'admin';

  const [editingUser, setEditingUser] = useState<EditingUser | null>(null);
  const [dialogType, setDialogType] = useState<DialogType>(null);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sectors, setSectors] = useState<any[]>([]);

  // Form states
  const [newFullName, setNewFullName] = useState('');
  const [newDepartment, setNewDepartment] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newSectorId, setNewSectorId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    fetchSectors();
  }, []);

  const fetchSectors = async () => {
    try {
      const { data } = await (supabase as any)
        .from('sectors')
        .select('id, name')
        .order('name');
      if (data) setSectors(data);
    } catch (err) {
      console.error('Erro ao carregar setores:', err);
    }
  };

  const openDialog = (user: EditingUser, type: DialogType) => {
    setEditingUser(user);
    setDialogType(type);
    setNewFullName(user.full_name);
    setNewDepartment(user.department || '');
    setNewEmail(user.email);
    setNewPassword('');
    setConfirmPassword('');
    setNewRole(user.roles[0] || 'user');
    setNewSectorId(user.sector_id || '');
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const closeDialog = () => {
    setEditingUser(null);
    setDialogType(null);
    setSaving(false);
  };

  const handleSaveProfile = async () => {
    if (!editingUser || !newFullName.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    setSaving(true);
    try {
      await updateUserProfile(editingUser.id, {
        full_name: newFullName.trim(),
        department: newDepartment.trim() || undefined,
      });
      toast.success('Perfil atualizado com sucesso');
      closeDialog();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar perfil');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEmail = async () => {
    if (!editingUser || !newEmail.trim()) {
      toast.error('Email é obrigatório');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      toast.error('Email inválido');
      return;
    }

    setSaving(true);
    try {
      await updateUserEmail(editingUser.id, newEmail.trim());
      toast.success('Email atualizado com sucesso');
      closeDialog();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar email');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePassword = async () => {
    if (!editingUser) return;

    if (newPassword.length < 6) {
      toast.error('Senha deve ter pelo menos 6 caracteres');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }

    setSaving(true);
    try {
      await updateUserPassword(editingUser.id, newPassword);
      toast.success('Senha atualizada com sucesso');
      closeDialog();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar senha');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRole = async () => {
    if (!editingUser || !newRole) {
      toast.error('Selecione uma função');
      return;
    }

    setSaving(true);
    try {
      await updateUserRole(editingUser.id, newRole);
      toast.success('Função atualizada com sucesso');
      closeDialog();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar função');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSector = async () => {
    if (!editingUser) return;

    setSaving(true);
    try {
      await (supabase as any)
        .from('profiles')
        .update({ sector_id: newSectorId || null })
        .eq('id', editingUser.id);
      
      toast.success('Setor atualizado com sucesso');
      closeDialog();
      refetch();
    } catch (err) {
      toast.error('Erro ao atualizar setor');
    } finally {
      setSaving(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin':
        return 'destructive';
      case 'analyst':
        return 'default';
      default:
        return 'secondary';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin':
        return 'Administrador';
      case 'analyst':
        return 'Analista';
      default:
        return 'Usuário';
    }
  };

  const filteredUsers = users.filter(user => {
    const search = searchTerm.toLowerCase();
    return (
      user.full_name.toLowerCase().includes(search) ||
      user.email.toLowerCase().includes(search) ||
      (user.department?.toLowerCase().includes(search) || false)
    );
  });

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={refetch}>Tentar novamente</Button>
        </CardContent>
      </Card>
    );
  }

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-destructive font-medium mb-2">Acesso Negado</p>
          <p className="text-muted-foreground">
            Apenas administradores podem acessar o gerenciamento de usuários.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Gerenciamento de Usuários</CardTitle>
              <CardDescription>
                Visualize e edite informações dos usuários do sistema
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar usuários..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Departamento</TableHead>
                  <TableHead>Setor</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => {
                  const userSector = sectors.find(s => s.id === user.sector_id);
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={user.avatar_url || undefined} />
                            <AvatarFallback className="text-xs">
                              {getInitials(user.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{user.full_name}</p>
                            <p className="text-sm text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground">
                          {user.department || '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground">
                          {userSector?.name || '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getRoleBadgeVariant(user.roles[0])}>
                          {getRoleLabel(user.roles[0])}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title={isAdmin ? "Editar perfil" : "Apenas administradores podem editar perfil"}
                            disabled={!isAdmin}
                            onClick={() => openDialog(user, 'profile')}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={isAdmin ? "Alterar email" : "Apenas administradores podem alterar email"}
                            disabled={!isAdmin}
                            onClick={() => openDialog(user, 'email')}
                          >
                            <Mail className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={isAdmin ? "Alterar senha" : "Apenas administradores podem alterar senha"}
                            disabled={!isAdmin}
                            onClick={() => openDialog(user, 'password')}
                          >
                            <Key className="h-4 w-4" />
                          </Button>
                          {isAdmin && user.id !== currentUser?.id && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Alterar setor"
                                onClick={() => openDialog(user as EditingUser, 'sector')}
                              >
                                <Building className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Alterar função"
                                onClick={() => openDialog(user, 'role')}
                              >
                                <Shield className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Nenhum usuário encontrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Profile Dialog */}
      <Dialog open={dialogType === 'profile'} onOpenChange={() => closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Perfil</DialogTitle>
            <DialogDescription>
              Altere as informações do perfil de {editingUser?.full_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome Completo</Label>
              <Input
                id="edit-name"
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                placeholder="Nome completo"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-department">Departamento</Label>
              <Input
                id="edit-department"
                value={newDepartment}
                onChange={(e) => setNewDepartment(e.target.value)}
                placeholder="Ex: TI, RH, Financeiro"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={handleSaveProfile} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Dialog */}
      <Dialog open={dialogType === 'email'} onOpenChange={() => closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Email</DialogTitle>
            <DialogDescription>
              Altere o email de {editingUser?.full_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-email">Novo Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="novo@email.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={handleSaveEmail} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Dialog */}
      <Dialog open={dialogType === 'password'} onOpenChange={() => closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Senha</DialogTitle>
            <DialogDescription>
              Defina uma nova senha para {editingUser?.full_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-password">Nova Senha</Label>
              <div className="relative">
                <Input
                  id="edit-password"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-confirm-password">Confirmar Senha</Label>
              <div className="relative">
                <Input
                  id="edit-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirme a nova senha"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={handleSavePassword} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role Dialog */}
      <Dialog open={dialogType === 'role'} onOpenChange={() => closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Função</DialogTitle>
            <DialogDescription>
              Altere a função de {editingUser?.full_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Função</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma função" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Usuário</SelectItem>
                  <SelectItem value="analyst">Analista</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Apenas administradores podem alterar funções de usuários
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={handleSaveRole} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sector Dialog */}
      <Dialog open={dialogType === 'sector'} onOpenChange={() => closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atribuir Setor</DialogTitle>
            <DialogDescription>
              Atribua um setor a {editingUser?.full_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Setor</Label>
              <Select value={newSectorId} onValueChange={setNewSectorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um setor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sem setor atribuído</SelectItem>
                  {sectors.map((sector) => (
                    <SelectItem key={sector.id} value={sector.id}>
                      {sector.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Analysts verão apenas chamados do setor atribuído
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={handleSaveSector} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
