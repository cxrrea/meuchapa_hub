import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ManagedUser {
  id: string;
  email: string;
  full_name: string;
  department: string | null;
  avatar_url: string | null;
  roles: string[];
  created_at: string;
  last_sign_in_at: string | null;
  sector_id: string | null;
}

export function useUserManagement() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch all profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch all user roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .order('user_id');

      if (rolesError) throw rolesError;

      // Map roles by user_id
      const rolesByUserId = new Map<string, string[]>();
      (rolesData || []).forEach(({ user_id, role }) => {
        if (!rolesByUserId.has(user_id)) {
          rolesByUserId.set(user_id, []);
        }
        rolesByUserId.get(user_id)?.push(role);
      });

      // Combine profiles with roles
      const combinedUsers: ManagedUser[] = (profilesData || []).map(profile => ({
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        department: profile.department,
        avatar_url: profile.avatar_url,
        created_at: profile.created_at,
        last_sign_in_at: profile.updated_at,
        roles: rolesByUserId.get(profile.id) || [],
        sector_id: profile.sector_id || null,
      }));

      setUsers(combinedUsers);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar usuários';
      setError(message);
      console.error('Erro ao carregar usuários:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const updateUserEmail = async (userId: string, email: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ email })
        .eq('id', userId);

      if (error) throw error;
      toast.success('Email atualizado com sucesso');
      await fetchUsers();
    } catch (err) {
      toast.error('Erro ao atualizar email');
      throw err;
    }
  };

  const updateUserPassword = async (userId: string, password: string) => {
    try {
      // This would require admin function - for now we'll show a message
      toast.info('Alteração de senha via Edge Function (implementar depois)');
    } catch (err) {
      toast.error('Erro ao atualizar senha');
      throw err;
    }
  };

  const updateUserProfile = async (userId: string, data: { full_name?: string; department?: string }) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update(data)
        .eq('id', userId);

      if (error) throw error;
      toast.success('Perfil atualizado com sucesso');
      await fetchUsers();
    } catch (err) {
      toast.error('Erro ao atualizar perfil');
      throw err;
    }
  };

  const updateUserRole = async (userId: string, role: string) => {
    try {
      // First, delete existing roles for this user
      const { error: deleteError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      if (deleteError) throw deleteError;

      // Then insert the new role
      const { error: insertError } = await supabase
        .from('user_roles')
        .insert({
          user_id: userId,
          role: role,
        });

      if (insertError) throw insertError;
      toast.success(`Função alterada para "${role}"`);
      await fetchUsers();
    } catch (err) {
      toast.error('Erro ao atualizar função');
      throw err;
    }
  };

  return {
    users,
    loading,
    error,
    refetch: fetchUsers,
    updateUserEmail,
    updateUserPassword,
    updateUserProfile,
    updateUserRole,
  };
}
