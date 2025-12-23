-- 🔑 SCRIPT HELPER - Criar Usuário Admin
-- 
-- INSTRUÇÕES:
-- 1. Substitua os valores abaixo pelos seus dados:
--    - SEU_EMAIL_AQUI → seu@email.com
--    - SUA_SENHA_AQUI → sua-senha
--    - SEU_NOME_AQUI → João Silva
--
-- 2. Copie TODO este script
-- 3. Vá em: Supabase Dashboard → SQL Editor → New Query
-- 4. Cole este script
-- 5. Clique em RUN
-- 6. Pronto! ✅

-- ============================================================
-- PARTE 1: Criar usuário no Auth (com criptografia)
-- ============================================================

INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  phone_confirmed_at,
  confirmation_sent_at,
  confirmed_at
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'SEU_EMAIL_AQUI',
  crypt('SUA_SENHA_AQUI', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"SEU_NOME_AQUI"}',
  now(),
  now(),
  now(),
  now(),
  now()
);

-- ============================================================
-- PARTE 2: Obter ID do usuário criado (EXECUTE SEPARADAMENTE)
-- ============================================================
-- Depois de executar a PARTE 1 acima, execute isto:

SELECT 
  id as USER_ID,
  email,
  created_at
FROM auth.users 
WHERE email = 'SEU_EMAIL_AQUI'
LIMIT 1;

-- Copie o USER_ID que aparecer aqui ↑
-- Você usará nos próximos passos

-- ============================================================
-- PARTE 3: Criar Profile
-- ============================================================
-- Substitua: 'USER_ID_AQUI' pelo ID que você copiou acima

INSERT INTO public.profiles (
  id,
  email,
  full_name,
  created_at,
  updated_at
) VALUES (
  'USER_ID_AQUI',
  'SEU_EMAIL_AQUI',
  'SEU_NOME_AQUI',
  now(),
  now()
);

-- ============================================================
-- PARTE 4: Atribuir Role ADMIN
-- ============================================================
-- Substitua: 'USER_ID_AQUI' pelo ID que você copiou acima

INSERT INTO public.user_roles (
  user_id,
  role,
  created_at,
  updated_at
) VALUES (
  'USER_ID_AQUI',
  'admin',
  now(),
  now()
);

-- ============================================================
-- PARTE 5: Validar (execute para confirmar)
-- ============================================================

SELECT 
  u.id,
  u.email,
  p.full_name,
  ur.role
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
LEFT JOIN public.user_roles ur ON u.id = ur.user_id
WHERE u.email = 'SEU_EMAIL_AQUI';

-- Esperado:
-- ├─ id: (UUID do seu usuário)
-- ├─ email: seu@email.com
-- ├─ full_name: Seu Nome
-- └─ role: admin

-- ============================================================
-- ✅ SUCESSO!
-- Seu usuário admin foi criado e pode fazer login agora!
-- ============================================================
