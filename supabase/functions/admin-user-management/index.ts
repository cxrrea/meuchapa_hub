import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create client with user's token to verify they are staff
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get current user
    const { data: { user: currentUser }, error: userError } = await userClient.auth.getUser();
    if (userError || !currentUser) {
      return new Response(JSON.stringify({ error: 'Usuário não autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user is staff
    const { data: isStaff } = await userClient.rpc('is_staff', { _user_id: currentUser.id });
    if (!isStaff) {
      return new Response(JSON.stringify({ error: 'Acesso negado. Apenas analistas podem gerenciar usuários.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create admin client for privileged operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { action, userId, data } = await req.json();

    switch (action) {
      case 'list_users': {
        const { data: users, error } = await adminClient.auth.admin.listUsers();
        if (error) throw error;

        // Get profiles for additional info
        const { data: profiles } = await adminClient
          .from('profiles')
          .select('id, full_name, email, department, avatar_url');

        // Get roles
        const { data: roles } = await adminClient
          .from('user_roles')
          .select('user_id, role');

        const enrichedUsers = users.users.map(user => {
          const profile = profiles?.find(p => p.id === user.id);
          const userRoles = roles?.filter(r => r.user_id === user.id).map(r => r.role) || ['user'];
          return {
            id: user.id,
            email: user.email,
            full_name: profile?.full_name || 'Sem nome',
            department: profile?.department,
            avatar_url: profile?.avatar_url,
            roles: userRoles,
            created_at: user.created_at,
            last_sign_in_at: user.last_sign_in_at,
          };
        });

        return new Response(JSON.stringify({ users: enrichedUsers }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'update_email': {
        if (!userId || !data?.email) {
          return new Response(JSON.stringify({ error: 'userId e email são obrigatórios' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { error } = await adminClient.auth.admin.updateUserById(userId, {
          email: data.email,
        });

        if (error) throw error;

        // Update profile email too
        await adminClient.from('profiles').update({ email: data.email }).eq('id', userId);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'update_password': {
        if (!userId || !data?.password) {
          return new Response(JSON.stringify({ error: 'userId e password são obrigatórios' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (data.password.length < 6) {
          return new Response(JSON.stringify({ error: 'Senha deve ter pelo menos 6 caracteres' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { error } = await adminClient.auth.admin.updateUserById(userId, {
          password: data.password,
        });

        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'update_profile': {
        if (!userId) {
          return new Response(JSON.stringify({ error: 'userId é obrigatório' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const updates: Record<string, unknown> = {};
        if (data?.full_name !== undefined) updates.full_name = data.full_name;
        if (data?.department !== undefined) updates.department = data.department;

        if (Object.keys(updates).length > 0) {
          updates.updated_at = new Date().toISOString();
          const { error } = await adminClient.from('profiles').update(updates).eq('id', userId);
          if (error) throw error;
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'update_role': {
        if (!userId || !data?.role) {
          return new Response(JSON.stringify({ error: 'userId e role são obrigatórios' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Check if current user is admin (only admins can change roles)
        const { data: isAdmin } = await userClient.rpc('has_role', { 
          _user_id: currentUser.id, 
          _role: 'admin' 
        });

        if (!isAdmin) {
          return new Response(JSON.stringify({ error: 'Apenas administradores podem alterar funções' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Delete existing roles and insert new one
        await adminClient.from('user_roles').delete().eq('user_id', userId);
        const { error } = await adminClient.from('user_roles').insert({
          user_id: userId,
          role: data.role,
        });

        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Ação inválida' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (error: unknown) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro interno';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
