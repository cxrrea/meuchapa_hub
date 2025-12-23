import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTicketStatuses } from '@/hooks/useTickets';
import { supabase } from '@/integrations/supabase/client';
import AppLayout from '@/components/layout/AppLayout';
import UserManagement from '@/components/settings/UserManagement';
import SectorManagement from '@/components/settings/SectorManagement';
import CategoryManagement from '@/components/settings/CategoryManagement';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, GripVertical, User, Lock, Camera, Eye, EyeOff, Users, Building } from 'lucide-react';

export default function Settings() {
  const navigate = useNavigate();
  const { profile, isStaff, loading: authLoading, user } = useAuth();
  const { statuses, refetch } = useTicketStatuses();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Status dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStatus, setEditingStatus] = useState<{id: string; name: string; color: string} | null>(null);
  const [statusName, setStatusName] = useState('');
  const [statusColor, setStatusColor] = useState('#f97316');
  const [saving, setSaving] = useState(false);

  // Profile state
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [department, setDepartment] = useState(profile?.department || '');
  const [workingHoursStart, setWorkingHoursStart] = useState<number>(profile?.working_hours_start || 9);
  const [workingHoursEnd, setWorkingHoursEnd] = useState<number>(profile?.working_hours_end || 18);
  const [workingHoursEnabled, setWorkingHoursEnabled] = useState<boolean>(profile?.working_hours_enabled || false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!profile) {
    navigate('/auth');
    return null;
  }

  const handleOpenDialog = (status?: {id: string; name: string; color: string}) => {
    if (status) {
      setEditingStatus(status);
      setStatusName(status.name);
      setStatusColor(status.color);
    } else {
      setEditingStatus(null);
      setStatusName('');
      setStatusColor('#f97316');
    }
    setIsDialogOpen(true);
  };

  const handleSaveStatus = async () => {
    if (!statusName.trim()) {
      toast.error('Nome do status é obrigatório');
      return;
    }

    setSaving(true);

    if (editingStatus) {
      const { error } = await supabase
        .from('ticket_statuses')
        .update({ name: statusName.trim(), color: statusColor })
        .eq('id', editingStatus.id);

      if (error) {
        toast.error('Erro ao atualizar status');
      } else {
        toast.success('Status atualizado');
        setIsDialogOpen(false);
        refetch();
      }
    } else {
      const maxOrder = Math.max(...statuses.map(s => s.order_index), 0);
      const { error } = await supabase.from('ticket_statuses').insert({
        name: statusName.trim(),
        color: statusColor,
        order_index: maxOrder + 1,
      });

      if (error) {
        if (error.code === '23505') {
          toast.error('Já existe um status com esse nome');
        } else {
          toast.error('Erro ao criar status');
        }
      } else {
        toast.success('Status criado');
        setIsDialogOpen(false);
        refetch();
      }
    }

    setSaving(false);
  };

  const handleDeleteStatus = async (id: string, isDefault: boolean) => {
    if (isDefault) {
      toast.error('Não é possível excluir status padrão');
      return;
    }

    const { error } = await supabase.from('ticket_statuses').delete().eq('id', id);

    if (error) {
      toast.error('Erro ao excluir status. Verifique se não há chamados usando este status.');
    } else {
      toast.success('Status excluído');
      refetch();
    }
  };

  const handleSaveProfile = async () => {
    if (!fullName.trim()) {
      toast.error('Nome completo é obrigatório');
      return;
    }

    setSavingProfile(true);
    
    // Build update object with basic fields
    const basicUpdateData = {
      full_name: fullName.trim(),
      department: department.trim() || null,
    };

    // Try to update with all fields first
    const updateData: typeof basicUpdateData & Record<string, string | number | boolean | null | undefined> = { ...basicUpdateData };
    
    if (isStaff) {
      updateData.working_hours_start = workingHoursStart;
      updateData.working_hours_end = workingHoursEnd;
      updateData.working_hours_enabled = workingHoursEnabled;
    }

    let { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', user?.id);

    // Fallback: if working hours fields fail, try without them
    if (error && isStaff && error.message?.includes('working_hours')) {
      console.warn('Working hours columns may not exist yet, updating without them');
      const { error: fallbackError } = await supabase
        .from('profiles')
        .update(basicUpdateData)
        .eq('id', user?.id);
      
      if (!fallbackError) {
        error = null; // Success with fallback
        toast.success('Perfil atualizado (horário de atendimento será ativado após migração)');
      } else {
        error = fallbackError;
      }
    }

    if (error) {
      console.error('Profile update error:', error);
      toast.error('Erro ao salvar perfil: ' + (error.message || 'Tente novamente'));
    } else {
      if (!error) {
        toast.success('Perfil atualizado com sucesso');
      }
      // Reload page to refresh profile in context
      setTimeout(() => window.location.reload(), 1000);
    }

    setSavingProfile(false);
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione uma imagem');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 2MB');
      return;
    }

    setUploadingPhoto(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user?.id}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      // Upload to storage
      const { error: uploadError, data } = await supabase.storage
        .from('attachments')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('attachments')
        .getPublicUrl(filePath);

      // Update profile with new avatar URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user?.id);

      if (updateError) throw updateError;

      toast.success('Foto de perfil atualizada');
      setTimeout(() => window.location.reload(), 1000);
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('Erro ao fazer upload da foto: ' + (error.message || 'Tente novamente'));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword) {
      toast.error('Digite a senha atual');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('A nova senha deve ter pelo menos 6 caracteres');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }

    setSavingPassword(true);

    try {
      // First, verify current password by trying to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: currentPassword,
      });

      if (signInError) {
        toast.error('Senha atual incorreta');
        setSavingPassword(false);
        return;
      }

      // Update password
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        toast.error('Erro ao alterar senha: ' + error.message);
      } else {
        toast.success('Senha alterada com sucesso');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (error) {
      toast.error('Erro ao alterar senha');
    }

    setSavingPassword(false);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
          <p className="text-muted-foreground">Gerencie seu perfil e configurações do sistema</p>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList>
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Perfil
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Segurança
            </TabsTrigger>
            {isStaff && (
              <TabsTrigger value="users" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Usuários
              </TabsTrigger>
            )}
            {isStaff && (
              <TabsTrigger value="sectors" className="flex items-center gap-2">
                <Building className="h-4 w-4" />
                Setores
              </TabsTrigger>
            )}
            {isStaff && (
              <TabsTrigger value="categories" className="flex items-center gap-2">
                <Building className="h-4 w-4" />
                Categorias
              </TabsTrigger>
            )}
            {isStaff && (
              <TabsTrigger value="system">
                Sistema
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="profile" className="space-y-6">
            {/* Profile Photo */}
            <Card>
              <CardHeader>
                <CardTitle>Foto de Perfil</CardTitle>
                <CardDescription>
                  Clique na foto para alterar sua imagem de perfil
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-6">
                <div className="relative">
                  <Avatar className="h-24 w-24 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <AvatarImage src={profile.avatar_url || undefined} />
                    <AvatarFallback className="text-xl">
                      {getInitials(profile.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-0 right-0 p-1.5 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition"
                    disabled={uploadingPhoto}
                  >
                    {uploadingPhoto ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoUpload}
                  />
                </div>
                <div>
                  <p className="font-medium">{profile.full_name}</p>
                  <p className="text-sm text-muted-foreground">{profile.email}</p>
                </div>
              </CardContent>
            </Card>

            {/* Personal Data */}
            <Card>
              <CardHeader>
                <CardTitle>Dados Pessoais</CardTitle>
                <CardDescription>
                  Atualize suas informações pessoais
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={profile.email}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    O email não pode ser alterado
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nome Completo</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Seu nome completo"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="department">Departamento</Label>
                  <Input
                    id="department"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="Ex: TI, RH, Financeiro"
                  />
                </div>

                {/* Working Hours Section - Only for Staff */}
                {isStaff && (
                  <>
                    <div className="border-t pt-4 mt-4">
                      <div className="space-y-4">
                        <div>
                          <h3 className="font-semibold mb-3">Horário de Atendimento</h3>
                          <p className="text-sm text-muted-foreground mb-3">
                            Defina seu horário de atendimento. As métricas serão contabilizadas apenas para chamados abertos dentro deste período.
                          </p>
                        </div>

                        <div className="flex items-center gap-2 mb-4">
                          <input
                            type="checkbox"
                            id="workingHoursEnabled"
                            checked={workingHoursEnabled}
                            onChange={(e) => setWorkingHoursEnabled(e.target.checked)}
                            className="rounded border-gray-300"
                          />
                          <Label htmlFor="workingHoursEnabled" className="cursor-pointer">
                            Contar métricas apenas durante meu horário de atendimento
                          </Label>
                        </div>

                        {workingHoursEnabled && (
                          <div className="grid grid-cols-2 gap-4 bg-secondary/30 p-4 rounded-lg">
                            <div className="space-y-2">
                              <Label htmlFor="startHour">Hora de Início</Label>
                              <div className="flex items-center gap-2">
                                <select
                                  id="startHour"
                                  value={workingHoursStart}
                                  onChange={(e) => setWorkingHoursStart(parseInt(e.target.value))}
                                  className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {Array.from({ length: 24 }, (_, i) => (
                                    <option key={i} value={i}>
                                      {i.toString().padStart(2, '0')}:00
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="endHour">Hora de Término</Label>
                              <div className="flex items-center gap-2">
                                <select
                                  id="endHour"
                                  value={workingHoursEnd}
                                  onChange={(e) => setWorkingHoursEnd(parseInt(e.target.value))}
                                  className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {Array.from({ length: 24 }, (_, i) => (
                                    <option key={i} value={i}>
                                      {i.toString().padStart(2, '0')}:00
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                <Button onClick={handleSaveProfile} disabled={savingProfile}>
                  {savingProfile && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Salvar Alterações
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Alterar Senha</CardTitle>
                <CardDescription>
                  Para sua segurança, confirme sua senha atual antes de definir uma nova
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Senha Atual</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Digite sua senha atual"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">Nova Senha</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Digite a nova senha"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Mínimo de 6 caracteres
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
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
                <Button onClick={handleChangePassword} disabled={savingPassword}>
                  {savingPassword && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Alterar Senha
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {isStaff && (
            <TabsContent value="users" className="space-y-6">
              <UserManagement />
            </TabsContent>
          )}

          {isStaff && (
            <TabsContent value="sectors" className="space-y-6">
              <SectorManagement />
            </TabsContent>
          )}

          {isStaff && (
            <TabsContent value="categories" className="space-y-6">
              <CategoryManagement />
            </TabsContent>
          )}

          {isStaff && (
            <TabsContent value="system" className="space-y-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Status de Chamados</CardTitle>
                    <CardDescription>
                      Crie e gerencie os status disponíveis para os chamados
                    </CardDescription>
                  </div>
                  <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="hero" onClick={() => handleOpenDialog()}>
                        <Plus className="h-4 w-4" />
                        Novo Status
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>
                          {editingStatus ? 'Editar Status' : 'Novo Status'}
                        </DialogTitle>
                        <DialogDescription>
                          {editingStatus
                            ? 'Altere as informações do status'
                            : 'Preencha as informações para criar um novo status'}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="name">Nome</Label>
                          <Input
                            id="name"
                            placeholder="Ex: Aguardando aprovação"
                            value={statusName}
                            onChange={(e) => setStatusName(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="color">Cor</Label>
                          <div className="flex gap-3 items-center">
                            <Input
                              id="color"
                              type="color"
                              value={statusColor}
                              onChange={(e) => setStatusColor(e.target.value)}
                              className="w-16 h-10 p-1 cursor-pointer"
                            />
                            <Input
                              value={statusColor}
                              onChange={(e) => setStatusColor(e.target.value)}
                              className="flex-1"
                              placeholder="#f97316"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: statusColor }}
                          />
                          <span
                            className="text-sm font-medium"
                            style={{ color: statusColor }}
                          >
                            {statusName || 'Preview'}
                          </span>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                          Cancelar
                        </Button>
                        <Button onClick={handleSaveStatus} disabled={saving}>
                          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                          {editingStatus ? 'Salvar' : 'Criar'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Cor</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {statuses.map((status) => (
                        <TableRow key={status.id}>
                          <TableCell>
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: status.color }}
                              />
                              <span className="font-medium">{status.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <code className="text-xs bg-secondary px-2 py-1 rounded">
                              {status.color}
                            </code>
                          </TableCell>
                          <TableCell>
                            {status.is_default ? (
                              <span className="text-xs text-muted-foreground">Padrão</span>
                            ) : (
                              <span className="text-xs text-primary">Personalizado</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenDialog(status)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteStatus(status.id, status.is_default)}
                                disabled={status.is_default}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </AppLayout>
  );
}
