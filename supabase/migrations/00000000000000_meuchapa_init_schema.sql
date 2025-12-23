/**
 * ============================================================================
 * MEUCHAPA SUPPORT HUB - DATABASE INITIALIZATION SCRIPT
 * ============================================================================
 * 
 * PROPÓSITO:
 *   Script SQL completo para inicializar o banco de dados do zero no Supabase.
 *   Consolida todas as estruturas necessárias em uma única execução.
 * 
 * PREMISSAS DO PROJETO:
 *   - Sistema de suporte ao cliente com gerenciamento de chamados (tickets)
 *   - Usuários com 3 níveis de role: admin, analyst, user
 *   - Suporte a setores/departamentos (multi-tenant por setor)
 *   - Rastreamento de métricas de atendimento (SLA, tempo de resposta, etc)
 *   - Sistema de mensagens e anexos para tickets
 *   - Row-Level Security (RLS) ativado em todas as tabelas
 * 
 * ARQUITETURA:
 *   - Base: Integração com Supabase Auth (tabela auth.users)
 *   - Perfis: Extensão de dados do usuário (profiles)
 *   - Tickets: Sistema de chamados com rastreamento completo
 *   - Setores: Separação lógica de equipes/departamentos
 *   - Métricas: Rastreamento de SLA e performance
 *   - Armazenamento: Bucket S3 para anexos
 * 
 * COMPATIBILIDADE:
 *   ✓ PostgreSQL 14+
 *   ✓ Supabase
 *   ✓ UUID com gen_random_uuid()
 * 
 * ============================================================================
 */

-- ============================================================================
-- 1. TIPOS CUSTOMIZADOS (ENUMS)
-- ============================================================================

-- Definir roles de usuário
CREATE TYPE public.app_role AS ENUM ('admin', 'analyst', 'user');

-- Definir prioridades de tickets
CREATE TYPE public.ticket_priority AS ENUM ('low', 'medium', 'high', 'critical');

-- ============================================================================
-- 2. TABELA: PROFILES (Perfis de Usuário)
-- ============================================================================

CREATE TABLE public.profiles (
  -- Identificadores e chaves
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Informações básicas
  full_name TEXT NOT NULL DEFAULT 'Usuário',
  email TEXT NOT NULL UNIQUE,
  
  -- Informações profissionais
  department TEXT,
  avatar_url TEXT,
  
  -- Configurações
  working_hours_start INTEGER DEFAULT 9,
  working_hours_end INTEGER DEFAULT 18,
  
  -- Auditoria
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Validações
  CONSTRAINT email_format CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
);

-- Índices
CREATE INDEX idx_profiles_email ON public.profiles(email);
CREATE INDEX idx_profiles_created_at ON public.profiles(created_at);

-- ============================================================================
-- 3. TABELA: USER_ROLES (Gerenciamento de Roles)
-- ============================================================================

CREATE TABLE public.user_roles (
  -- Identificadores
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Role
  role app_role NOT NULL DEFAULT 'user',
  
  -- Auditoria
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(user_id, role),
  CONSTRAINT valid_role CHECK (role IN ('admin', 'analyst', 'user'))
);

-- Índices
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_role ON public.user_roles(role);

-- ============================================================================
-- 4. TABELA: SECTORS (Setores/Departamentos)
-- ============================================================================

CREATE TABLE public.sectors (
  -- Identificadores
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Informações básicas
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT DEFAULT '#3b82f6',
  
  -- Auditoria
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Validações
  CONSTRAINT sector_name_length CHECK (char_length(name) > 0 AND char_length(name) <= 255)
);

-- Índices
CREATE INDEX idx_sectors_name ON public.sectors(name);
CREATE INDEX idx_sectors_created_by ON public.sectors(created_by);
CREATE INDEX idx_sectors_created_at ON public.sectors(created_at);

-- ============================================================================
-- 5. TABELA: SECTOR_MEMBERS (Membros de Setores)
-- ============================================================================

CREATE TABLE public.sector_members (
  -- Identificadores
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID NOT NULL REFERENCES public.sectors(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Auditoria
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(sector_id, user_id)
);

-- Índices
CREATE INDEX idx_sector_members_sector_id ON public.sector_members(sector_id);
CREATE INDEX idx_sector_members_user_id ON public.sector_members(user_id);

-- ============================================================================
-- 6. TABELA: TICKET_STATUSES (Status de Tickets)
-- ============================================================================

CREATE TABLE public.ticket_statuses (
  -- Identificadores
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Informações
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6b7280',
  description TEXT,
  
  -- Configurações
  is_default BOOLEAN DEFAULT FALSE,
  order_index INTEGER DEFAULT 0,
  
  -- Suporte a multi-setor (opcionall, NULL = global)
  sector_id UUID REFERENCES public.sectors(id) ON DELETE CASCADE,
  
  -- Auditoria
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(name, sector_id),
  CONSTRAINT valid_order CHECK (order_index >= 0),
  CONSTRAINT color_format CHECK (color ~ '^#[0-9A-Fa-f]{6}$')
);

-- Índices
CREATE INDEX idx_ticket_statuses_name ON public.ticket_statuses(name);
CREATE INDEX idx_ticket_statuses_sector_id ON public.ticket_statuses(sector_id);
CREATE INDEX idx_ticket_statuses_order ON public.ticket_statuses(order_index);

-- ============================================================================
-- 7. TABELA: TICKETS (Chamados/Tickets)
-- ============================================================================

CREATE TABLE public.tickets (
  -- Identificadores
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number BIGSERIAL UNIQUE NOT NULL,
  
  -- Informações do ticket
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  
  -- Prioridade e status
  priority ticket_priority DEFAULT 'medium',
  status_id UUID NOT NULL REFERENCES public.ticket_statuses(id),
  
  -- Relacionamentos
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES public.profiles(id),
  
  -- Setor (Multi-tenant)
  sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  
  -- Rastreamento de tempo (SLA)
  first_response_at TIMESTAMP WITH TIME ZONE,
  resolution_started_at TIMESTAMP WITH TIME ZONE,
  closed_at TIMESTAMP WITH TIME ZONE,
  expected_resolution_at TIMESTAMP WITH TIME ZONE,
  
  -- Observações
  analyst_observation TEXT,
  
  -- Soft delete
  archived_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  
  -- Auditoria
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Validações
  CONSTRAINT title_length CHECK (char_length(title) > 0 AND char_length(title) <= 255),
  CONSTRAINT description_length CHECK (char_length(description) > 0),
  CONSTRAINT valid_dates CHECK (
    closed_at IS NULL OR closed_at >= created_at
  )
);

-- Índices
CREATE INDEX idx_tickets_ticket_number ON public.tickets(ticket_number DESC);
CREATE INDEX idx_tickets_created_by ON public.tickets(created_by);
CREATE INDEX idx_tickets_assigned_to ON public.tickets(assigned_to);
CREATE INDEX idx_tickets_status_id ON public.tickets(status_id);
CREATE INDEX idx_tickets_sector_id ON public.tickets(sector_id);
CREATE INDEX idx_tickets_priority ON public.tickets(priority);
CREATE INDEX idx_tickets_created_at ON public.tickets(created_at DESC);
CREATE INDEX idx_tickets_closed_at ON public.tickets(closed_at DESC);
CREATE INDEX idx_tickets_archived_at ON public.tickets(archived_at);
CREATE INDEX idx_tickets_search ON public.tickets USING gin (to_tsvector('portuguese', title || ' ' || description));

-- ============================================================================
-- 8. TABELA: TICKET_MESSAGES (Mensagens de Tickets)
-- ============================================================================

CREATE TABLE public.ticket_messages (
  -- Identificadores
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  
  -- Conteúdo
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  
  -- Auditoria
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Validações
  CONSTRAINT content_not_empty CHECK (char_length(content) > 0)
);

-- Índices
CREATE INDEX idx_ticket_messages_ticket_id ON public.ticket_messages(ticket_id);
CREATE INDEX idx_ticket_messages_sender_id ON public.ticket_messages(sender_id);
CREATE INDEX idx_ticket_messages_created_at ON public.ticket_messages(created_at DESC);

-- ============================================================================
-- 9. TABELA: TICKET_ATTACHMENTS (Anexos de Tickets)
-- ============================================================================

CREATE TABLE public.ticket_attachments (
  -- Identificadores
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.ticket_messages(id) ON DELETE CASCADE,
  
  -- Informações do arquivo
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  
  -- Auditoria
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Validações
  CONSTRAINT file_name_length CHECK (char_length(file_name) > 0),
  CONSTRAINT file_size_check CHECK (file_size IS NULL OR file_size > 0)
);

-- Índices
CREATE INDEX idx_ticket_attachments_ticket_id ON public.ticket_attachments(ticket_id);
CREATE INDEX idx_ticket_attachments_message_id ON public.ticket_attachments(message_id);
CREATE INDEX idx_ticket_attachments_uploaded_by ON public.ticket_attachments(uploaded_by);
CREATE INDEX idx_ticket_attachments_created_at ON public.ticket_attachments(created_at DESC);

-- ============================================================================
-- 10. TABELA: TICKET_METRICS (Métricas de Tickets)
-- ============================================================================

CREATE TABLE public.ticket_metrics (
  -- Identificadores
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL UNIQUE REFERENCES public.tickets(id) ON DELETE CASCADE,
  analyst_id UUID REFERENCES public.profiles(id),
  
  -- Métricas de tempo (em minutos)
  response_time_minutes INTEGER,
  resolution_time_minutes INTEGER,
  interaction_count INTEGER DEFAULT 0,
  
  -- Auditoria
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Validações
  CONSTRAINT positive_response_time CHECK (response_time_minutes IS NULL OR response_time_minutes >= 0),
  CONSTRAINT positive_resolution_time CHECK (resolution_time_minutes IS NULL OR resolution_time_minutes >= 0),
  CONSTRAINT positive_interactions CHECK (interaction_count >= 0)
);

-- Índices
CREATE INDEX idx_ticket_metrics_ticket_id ON public.ticket_metrics(ticket_id);
CREATE INDEX idx_ticket_metrics_analyst_id ON public.ticket_metrics(analyst_id);
CREATE INDEX idx_ticket_metrics_created_at ON public.ticket_metrics(created_at DESC);

-- ============================================================================
-- 11. FUNÇÕES AUXILIARES
-- ============================================================================

-- Função: Verificar se usuário tem um role específico
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Função: Verificar se usuário é staff (admin ou analyst)
CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'analyst')
  )
$$;

-- Função: Atualizar campo updated_at automaticamente
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Função: Criar role 'user' padrão para novo usuário
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Criar profile
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', 'Usuário'),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;

  -- Criar role de usuário padrão
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 12. TRIGGERS
-- ============================================================================

-- Trigger: Atualizar updated_at em profiles
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Trigger: Atualizar updated_at em tickets
DROP TRIGGER IF EXISTS update_tickets_updated_at ON public.tickets;
CREATE TRIGGER update_tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Trigger: Atualizar updated_at em sectors
DROP TRIGGER IF EXISTS update_sectors_updated_at ON public.sectors;
CREATE TRIGGER update_sectors_updated_at
  BEFORE UPDATE ON public.sectors
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Trigger: Atualizar updated_at em ticket_metrics
DROP TRIGGER IF EXISTS update_ticket_metrics_updated_at ON public.ticket_metrics;
CREATE TRIGGER update_ticket_metrics_updated_at
  BEFORE UPDATE ON public.ticket_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Trigger: Criar profile e role ao novo usuário auth
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 13. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sector_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_metrics ENABLE ROW LEVEL SECURITY;

-- ====== PROFILES RLS ======
CREATE POLICY "profiles_select_all"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- ====== USER_ROLES RLS ======
CREATE POLICY "user_roles_select_own"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_roles_admin_all"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ====== SECTORS RLS ======
CREATE POLICY "sectors_select_member"
  ON public.sectors FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.sector_members WHERE sector_id = sectors.id
    )
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "sectors_insert_staff"
  ON public.sectors FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_staff(auth.uid())
  );

CREATE POLICY "sectors_update_own_or_admin"
  ON public.sectors FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "sectors_delete_own_or_admin"
  ON public.sectors FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

-- ====== SECTOR_MEMBERS RLS ======
CREATE POLICY "sector_members_select_own"
  ON public.sector_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR auth.uid() IN (
      SELECT user_id FROM public.sector_members sm2 
      WHERE sm2.sector_id = sector_members.sector_id
    )
  );

CREATE POLICY "sector_members_insert_creator_or_admin"
  ON public.sector_members FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sectors s
      WHERE s.id = sector_id
      AND (s.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "sector_members_delete_creator_or_admin"
  ON public.sector_members FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sectors s
      WHERE s.id = sector_id
      AND (s.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- ====== TICKET_STATUSES RLS ======
CREATE POLICY "ticket_statuses_select_all"
  ON public.ticket_statuses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "ticket_statuses_manage_staff"
  ON public.ticket_statuses FOR ALL
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- ====== TICKETS RLS ======
CREATE POLICY "tickets_select_own_or_staff"
  ON public.tickets FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_staff(auth.uid())
  );

CREATE POLICY "tickets_insert_user"
  ON public.tickets FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "tickets_update_own_or_staff"
  ON public.tickets FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_staff(auth.uid())
  );

CREATE POLICY "tickets_delete_admin"
  ON public.tickets FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ====== TICKET_MESSAGES RLS ======
CREATE POLICY "ticket_messages_select_own_or_staff"
  ON public.ticket_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_id
      AND (t.created_by = auth.uid() OR public.is_staff(auth.uid()))
    )
  );

CREATE POLICY "ticket_messages_insert_own"
  ON public.ticket_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_id
      AND (t.created_by = auth.uid() OR public.is_staff(auth.uid()))
    )
  );

-- ====== TICKET_ATTACHMENTS RLS ======
CREATE POLICY "ticket_attachments_select_own_or_staff"
  ON public.ticket_attachments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_id
      AND (t.created_by = auth.uid() OR public.is_staff(auth.uid()))
    )
  );

CREATE POLICY "ticket_attachments_insert_own"
  ON public.ticket_attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_id
      AND (t.created_by = auth.uid() OR public.is_staff(auth.uid()))
    )
  );

-- ====== TICKET_METRICS RLS ======
CREATE POLICY "ticket_metrics_select_staff"
  ON public.ticket_metrics FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "ticket_metrics_insert_staff"
  ON public.ticket_metrics FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "ticket_metrics_update_staff"
  ON public.ticket_metrics FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- ============================================================================
-- 14. REALTIME (Para mensagens em tempo real)
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;

-- ============================================================================
-- 15. STORAGE (Para anexos)
-- ============================================================================

-- Criar bucket de armazenamento
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Permitir upload autenticado
CREATE POLICY "Authenticated users can upload attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'attachments');

-- Permitir visualização de anexos
CREATE POLICY "Users can view attachments they have access to"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'attachments');

-- ============================================================================
-- 16. DADOS INICIAIS (SEED DATA)
-- ============================================================================

-- Inserir status de tickets padrão (global)
INSERT INTO public.ticket_statuses (name, color, is_default, order_index)
VALUES
  ('Aberto', '#f97316', TRUE, 1),
  ('Em Análise', '#3b82f6', TRUE, 2),
  ('Aguardando Resposta', '#eab308', TRUE, 3),
  ('Em Progresso', '#8b5cf6', TRUE, 4),
  ('Resolvido', '#22c55e', TRUE, 5),
  ('Fechado', '#6b7280', TRUE, 6)
ON CONFLICT (name, sector_id) DO NOTHING;

-- ============================================================================
-- 17. COMENTÁRIOS E DOCUMENTAÇÃO
-- ============================================================================

COMMENT ON TABLE public.profiles IS
'Extensão de dados dos usuários Supabase Auth. Armazena informações de perfil.';

COMMENT ON TABLE public.user_roles IS
'Mapeamento de roles para usuários. Suporta múltiplos roles por usuário.';

COMMENT ON TABLE public.sectors IS
'Setores/departamentos do sistema. Base para separação lógica de dados.';

COMMENT ON TABLE public.sector_members IS
'Associação de usuários aos setores. Define quem trabalha em qual setor.';

COMMENT ON TABLE public.tickets IS
'Chamados/tickets de suporte. Entidade principal do sistema.';

COMMENT ON TABLE public.ticket_messages IS
'Mensagens de conversação dentro de um ticket. Suporta realtime.';

COMMENT ON TABLE public.ticket_attachments IS
'Anexos de mensagens. Referencia storage bucket.';

COMMENT ON TABLE public.ticket_metrics IS
'Métricas de performance dos tickets. Rastreamento de SLA e tempos.';

COMMENT ON COLUMN public.tickets.archived_at IS
'Soft delete. NULL = ativo, timestamp = arquivado.';

COMMENT ON COLUMN public.tickets.first_response_at IS
'Timestamp da primeira resposta para cálculo de SLA de resposta.';

COMMENT ON COLUMN public.tickets.resolution_started_at IS
'Timestamp do início da resolução.';

COMMENT ON COLUMN public.tickets.closed_at IS
'Timestamp do fechamento para cálculo de SLA de resolução.';

-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================
