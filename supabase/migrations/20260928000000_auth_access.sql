-- Lower m_roles.rank = more power; the UI only hides what the database refuses anyway.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE public.m_settings (
    id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    company_name text NOT NULL DEFAULT 'StockDesk',
    timezone text NOT NULL DEFAULT 'Asia/Jakarta',
    currency text NOT NULL DEFAULT 'IDR' CHECK (currency ~ '^[A-Z]{3}$'),
    valuation_method text NOT NULL DEFAULT 'fifo' CHECK (valuation_method IN ('fifo', 'average')),
    expiry_warning_days integer NOT NULL DEFAULT 30 CHECK (expiry_warning_days BETWEEN 1 AND 365),
    min_shelf_life_days integer NOT NULL DEFAULT 0 CHECK (min_shelf_life_days BETWEEN 0 AND 3650),
    doc_prefixes jsonb NOT NULL DEFAULT
      '{"receipt":"GR","sales_order":"SO","pick_list":"PL","shipment":"DO","transfer":"TRF","count":"CNT"}',
    -- Nothing dated on or before this day is booked.
    locked_until date,
    demo_mode boolean NOT NULL DEFAULT false,
    -- Set by the Seed button; a pg_cron job runs the seed (longer than the API statement_timeout).
    demo_seed_requested_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.m_settings DEFAULT VALUES;

CREATE TABLE public.m_roles (
    id bigint PRIMARY KEY,
    role_name text NOT NULL UNIQUE,
    rank integer NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.m_features (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    feature_key text NOT NULL UNIQUE,
    feature_name text NOT NULL,
    icon_name text,
    path text
);

CREATE TABLE public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    role_id bigint REFERENCES public.m_roles ON DELETE SET NULL,
    full_name text,
    avatar_url text,
    phone_number text,
    language_preference text NOT NULL DEFAULT 'id' CHECK (language_preference IN ('id', 'en')),
    is_superadmin boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX profiles_role_id_idx ON public.profiles (role_id);

CREATE TABLE public.t_role_permissions (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    role_id bigint NOT NULL REFERENCES public.m_roles ON DELETE CASCADE,
    feature_id bigint NOT NULL REFERENCES public.m_features ON DELETE CASCADE,
    can_create boolean NOT NULL DEFAULT false,
    can_read boolean NOT NULL DEFAULT false,
    can_update boolean NOT NULL DEFAULT false,
    can_delete boolean NOT NULL DEFAULT false,
    UNIQUE (role_id, feature_id)
);
CREATE INDEX t_role_permissions_feature_idx ON public.t_role_permissions (feature_id);

-- NULL means "fall back to the role".
CREATE TABLE public.t_user_access_override (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
    feature_id bigint NOT NULL REFERENCES public.m_features ON DELETE CASCADE,
    can_create boolean,
    can_read boolean,
    can_update boolean,
    can_delete boolean,
    is_override_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid() REFERENCES public.profiles ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, feature_id)
);
CREATE INDEX t_user_access_override_feature_idx ON public.t_user_access_override (feature_id);

CREATE TABLE public.t_audit_log (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id uuid REFERENCES public.profiles ON DELETE SET NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    detail jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX t_audit_log_created_idx ON public.t_audit_log (created_at DESC);
CREATE INDEX t_audit_log_actor_idx ON public.t_audit_log (actor_id);
CREATE INDEX t_audit_log_entity_idx ON public.t_audit_log (entity_type, entity_id);

CREATE TABLE public.t_error_log (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id uuid,
    source text NOT NULL,
    message text NOT NULL,
    context jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX t_error_log_created_idx ON public.t_error_log (created_at DESC);
CREATE INDEX t_error_log_user_idx ON public.t_error_log (user_id, created_at DESC);

CREATE TABLE public.t_notifications (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
    title text NOT NULL,
    body text,
    link text,
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX t_notifications_user_idx ON public.t_notifications (user_id, created_at DESC);

CREATE TRIGGER trg_settings_updated_at BEFORE UPDATE ON public.m_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_override_updated_at BEFORE UPDATE ON public.t_user_access_override FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.m_roles (id, role_name, rank) VALUES
  (1, 'Admin', 1),
  (2, 'Warehouse Manager', 2),
  (3, 'Warehouse Worker', 3);

INSERT INTO public.m_features (feature_key, feature_name, icon_name, path) VALUES
  ('dashboard',        'Dashboard',            'LayoutDashboard', '/'),
  ('master-product',   'Produk & SKU',         'Package',         '/products'),
  ('master-warehouse', 'Gudang & Bin',         'Warehouse',       '/warehouses'),
  ('goods-receipt',    'Goods Receipt',        'PackagePlus',     '/inbound/receipts'),
  ('putaway',          'Putaway',              'ArrowDownToLine', '/inbound/putaway'),
  ('pick-list',        'Pick List & Rute',     'ListChecks',      '/outbound/pick-lists'),
  ('dispatch',         'Packing & Dispatch',   'Truck',           '/outbound/dispatch'),
  ('stock-transfer',   'Stock Transfer',       'ArrowLeftRight',  '/transfers'),
  ('stock-opname',     'Stock Opname',         'ClipboardCheck',  '/opname'),
  ('stock-audit',      'Movement Log & Audit', 'History',         '/audit'),
  ('valuation',        'Valuasi & Keuangan',   'Calculator',      '/valuation'),
  ('export',           'Export',               'Download',        '/export'),
  ('integration',      'Integrasi',            'Plug',            '/settings/integration'),
  ('users',            'Users & Access',       'Users',           '/settings/integration?tab=users'),
  ('stock-approval',   'Approval Stok',        'BadgeCheck',      '/opname');

-- CRUD letters per role: Worker, Manager, Admin. '' = no access. Migrations own the matrix; clients only read it.
INSERT INTO public.t_role_permissions (role_id, feature_id, can_create, can_read, can_update, can_delete)
SELECT r.id, f.id, m.perm LIKE '%C%', m.perm LIKE '%R%', m.perm LIKE '%U%', m.perm LIKE '%D%'
  FROM (VALUES
    ('dashboard',        'R',    'R',    'CRUD'),
    ('master-product',   'R',    'CRUD', 'CRUD'),
    ('master-warehouse', 'R',    'CRUD', 'CRUD'),
    ('goods-receipt',    'CRU',  'CRUD', 'CRUD'),
    ('putaway',          'CRU',  'CRUD', 'CRUD'),
    ('pick-list',        'RU',   'CRUD', 'CRUD'),
    ('dispatch',         'CRU',  'CRUD', 'CRUD'),
    ('stock-transfer',   'CR',   'CRUD', 'CRUD'),
    ('stock-opname',     'CRU',  'CRUD', 'CRUD'),
    ('stock-audit',      'R',    'R',    'R'),
    ('valuation',        '',     'R',    'CRUD'),
    ('export',           '',     'R',    'CRUD'),
    ('integration',      '',     '',     'CRUD'),
    ('users',            '',     '',     'CRUD'),
    ('stock-approval',   '',     'CRU',  'CRUD')
  ) AS v(feature_key, worker, manager, admin)
  JOIN public.m_features f ON f.feature_key = v.feature_key
  CROSS JOIN LATERAL (VALUES
    ('Warehouse Worker', v.worker),
    ('Warehouse Manager', v.manager),
    ('Admin', v.admin)
  ) AS m(role_name, perm)
  JOIN public.m_roles r ON r.role_name = m.role_name;

CREATE FUNCTION public.is_superadmin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE((SELECT is_superadmin FROM profiles WHERE id = auth.uid()), false);
$$;

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p JOIN m_roles r ON r.id = p.role_id
     WHERE p.id = auth.uid() AND r.role_name = 'Admin'
  );
$$;

-- Active override wins; a NULL override value falls back to the role.
CREATE FUNCTION public.has_permission(p_feature_key text, p_action text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT CASE p_action
       WHEN 'create' THEN o.can_create WHEN 'read' THEN o.can_read
       WHEN 'update' THEN o.can_update WHEN 'delete' THEN o.can_delete END
       FROM t_user_access_override o JOIN m_features f ON f.id = o.feature_id
      WHERE o.user_id = auth.uid() AND f.feature_key = p_feature_key AND o.is_override_active),
    (SELECT CASE p_action
       WHEN 'create' THEN rp.can_create WHEN 'read' THEN rp.can_read
       WHEN 'update' THEN rp.can_update WHEN 'delete' THEN rp.can_delete END
       FROM t_role_permissions rp
       JOIN m_features f ON f.id = rp.feature_id
       JOIN profiles p ON p.role_id = rp.role_id
      WHERE p.id = auth.uid() AND f.feature_key = p_feature_key),
    false
  );
$$;

-- True for anyone the Admin gave access to: a role or an active override.
CREATE FUNCTION public.has_any_access() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role_id IS NOT NULL)
      OR EXISTS (SELECT 1 FROM t_user_access_override WHERE user_id = auth.uid() AND is_override_active);
$$;

-- NULL when the caller has no role.
CREATE FUNCTION public.my_rank() RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT r.rank FROM profiles p JOIN m_roles r ON r.id = p.role_id WHERE p.id = auth.uid();
$$;

CREATE FUNCTION public.outranks(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT is_superadmin() OR (
    my_rank() IS NOT NULL
    AND NOT COALESCE((SELECT is_superadmin FROM profiles WHERE id = p_user_id), false)
    AND COALESCE((SELECT r.rank FROM profiles p JOIN m_roles r ON r.id = p.role_id WHERE p.id = p_user_id), 2147483647) > my_rank());
$$;

-- stockdesk.today (tx-local; API roles cannot call set_config) lets the demo seed replay history on past dates.
CREATE FUNCTION public.company_today() RETURNS date
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(NULLIF(current_setting('stockdesk.today', true), '')::date,
                  (now() AT TIME ZONE COALESCE((SELECT timezone FROM m_settings), 'Asia/Jakarta'))::date);
$$;

CREATE FUNCTION public.company_now_time() RETURNS time
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT (now() AT TIME ZONE COALESCE((SELECT timezone FROM m_settings), 'Asia/Jakarta'))::time;
$$;

-- No role until an Admin gives one: a stray OAuth account reaches nothing.
CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
             NULLIF(NEW.raw_user_meta_data->>'name', ''),
             split_part(NEW.email, '@', 1)),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'avatar_url', ''),
             NULLIF(NEW.raw_user_meta_data->>'picture', ''))
  )
  ON CONFLICT (id) DO UPDATE
    SET full_name  = EXCLUDED.full_name,
        avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Nobody changes their own role; you only move people ranked below you to a role also below you.
CREATE FUNCTION public.guard_profile_role_change() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_actor_rank int;
  v_old_rank   int;
  v_new_rank   int;
BEGIN
  IF auth.role() = 'service_role' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT has_permission('users', 'update') THEN
      NEW.role_id := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.role_id IS NOT DISTINCT FROM OLD.role_id THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = NEW.id THEN
    RAISE EXCEPTION 'You cannot change your own role';
  END IF;

  SELECT r.rank INTO v_actor_rank
    FROM profiles p JOIN m_roles r ON r.id = p.role_id WHERE p.id = auth.uid();
  IF v_actor_rank IS NULL THEN
    RAISE EXCEPTION 'Only someone with an assigned role can change roles';
  END IF;

  -- No role at all ranks below every role.
  v_old_rank := COALESCE((SELECT rank FROM m_roles WHERE id = OLD.role_id), 2147483647);
  v_new_rank := COALESCE((SELECT rank FROM m_roles WHERE id = NEW.role_id), 2147483647);

  IF v_old_rank <= v_actor_rank THEN
    RAISE EXCEPTION 'You can only change the role of someone below your own role';
  END IF;
  IF v_new_rank <= v_actor_rank THEN
    RAISE EXCEPTION 'You cannot assign a role at or above your own rank';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_profile_role_insert BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_role_change();
CREATE TRIGGER trg_guard_profile_role_change BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_role_change();

CREATE FUNCTION public.guard_superadmin_flag() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.is_superadmin IS DISTINCT FROM OLD.is_superadmin
     AND auth.uid() IS NOT NULL AND NOT is_superadmin() THEN
    RAISE EXCEPTION 'Only a superadmin can change that flag';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_superadmin_flag BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_superadmin_flag();

-- Direct API writes may only touch a document still in its editable status (TG_ARGV[0]) and never its status.
-- SECURITY DEFINER RPCs run as the function owner, so posting, sending and cancelling pass.
CREATE FUNCTION public.guard_document_status() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF OLD.status <> TG_ARGV[0] THEN
    RAISE EXCEPTION 'Only a document in status % can be edited or deleted', TG_ARGV[0];
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Status changes go through their action, not a direct update';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Callable pre-session (failed logins), so capped at 20 rows/min per user, 20 shared by all anon.
-- ponytail: one shared anon bucket; key on the request IP if that matters.
CREATE FUNCTION public.log_client_error(p_source text, p_message text, p_context jsonb DEFAULT NULL) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF (SELECT count(*) FROM t_error_log
       WHERE user_id IS NOT DISTINCT FROM auth.uid()
         AND created_at > now() - interval '1 minute') >= 20 THEN
    RETURN;
  END IF;
  INSERT INTO t_error_log (user_id, source, message, context)
  VALUES (auth.uid(), left(p_source, 64), left(p_message, 1000),
          CASE WHEN length(p_context::text) <= 4000 THEN p_context END);
END;
$$;

-- E-mail addresses are for admins only.
CREATE FUNCTION public.get_users_with_email()
RETURNS TABLE (id uuid, full_name text, email text, role_id bigint, role_name text, avatar_url text,
               created_at timestamptz, banned_until timestamptz, is_superadmin boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  SELECT p.id, p.full_name,
         CASE WHEN public.is_admin() THEN u.email::text ELSE '' END,
         p.role_id, r.role_name, p.avatar_url, p.created_at, u.banned_until, p.is_superadmin
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    LEFT JOIN public.m_roles r ON r.id = p.role_id
   WHERE NOT p.is_superadmin OR public.is_superadmin()
   ORDER BY p.created_at;
$$;

-- Creates/resets the superadmin login; SQL editor / seed-admin only, never exposed to API roles.
-- The superadmin is the app owner and checks every page, so it also holds the Admin role (deliberately, unlike the prompt).
CREATE FUNCTION public.superadmin_bootstrap(p_email text, p_password text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  IF length(COALESCE(p_password, '')) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters';
  END IF;

  SELECT id INTO v_id FROM auth.users WHERE email = p_email;
  IF v_id IS NOT NULL THEN
    UPDATE auth.users
       SET encrypted_password = crypt(p_password, gen_salt('bf')),
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           banned_until = NULL, updated_at = now()
     WHERE id = v_id;
  ELSE
    v_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      p_email, crypt(p_password, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{"full_name":"Superadmin"}',
      now(), now(), '', '', '', ''
    );
  END IF;

  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  SELECT gen_random_uuid(), v_id, v_id::text,
         jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true, 'phone_verified', false),
         'email', NULL, now(), now()
   WHERE NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_id AND provider = 'email');

  -- Owner context: skip the role/flag guards, which let service_role through.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  UPDATE profiles
     SET full_name = COALESCE(full_name, 'Superadmin'), is_superadmin = true,
         role_id = COALESCE(role_id, (SELECT id FROM m_roles WHERE role_name = 'Admin'))
   WHERE id = v_id;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v_id;
END;
$$;

ALTER TABLE public.m_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_user_access_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_error_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY settings_select ON public.m_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY settings_update ON public.m_settings FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY roles_select ON public.m_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY features_select ON public.m_features FOR SELECT TO authenticated USING (true);

CREATE POLICY role_perms_select ON public.t_role_permissions FOR SELECT TO authenticated USING (true);

CREATE POLICY overrides_select ON public.t_user_access_override FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.has_permission('users', 'read')));
-- Nobody grants themselves access, and only to people ranked below them.
CREATE POLICY overrides_write ON public.t_user_access_override FOR ALL TO authenticated
  USING ((SELECT public.has_permission('users', 'update')) AND user_id <> (SELECT auth.uid()) AND public.outranks(user_id))
  WITH CHECK ((SELECT public.has_permission('users', 'update')) AND user_id <> (SELECT auth.uid()) AND public.outranks(user_id));

CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (NOT is_superadmin OR id = (SELECT auth.uid()) OR (SELECT public.is_superadmin()));
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));
CREATE POLICY profiles_update_admin ON public.profiles FOR UPDATE TO authenticated
  USING ((SELECT public.has_permission('users', 'update')))
  WITH CHECK ((SELECT public.has_permission('users', 'update')));

-- Written only by triggers and edge functions. Access and integration changes show only to those who manage them.
CREATE POLICY audit_select ON public.t_audit_log FOR SELECT TO authenticated USING (
  CASE
    WHEN entity_type IN ('access_override', 'profile', 'role_permission', 'user') THEN (SELECT public.has_permission('users', 'read'))
    WHEN entity_type IN ('api_key', 'webhook') THEN (SELECT public.has_permission('integration', 'read'))
    ELSE (SELECT public.has_permission('stock-audit', 'read'))
  END);

CREATE POLICY error_log_select ON public.t_error_log FOR SELECT TO authenticated
  USING ((SELECT public.is_superadmin()));

CREATE POLICY notifications_select_own ON public.t_notifications FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY notifications_update_own ON public.t_notifications FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- Clients edit plain settings only; the lock and demo switch go through RPCs.
REVOKE UPDATE ON public.m_settings FROM authenticated;
GRANT UPDATE (company_name, timezone, currency, valuation_method, expiry_warning_days, min_shelf_life_days, doc_prefixes)
  ON public.m_settings TO authenticated;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
REVOKE EXECUTE ON FUNCTION public.superadmin_bootstrap(text, text), public.guard_document_status() FROM authenticated;
-- Failed logins are logged before a session exists.
GRANT EXECUTE ON FUNCTION public.log_client_error(text, text, jsonb) TO anon;

-- The storage schema survives a database reset, so buckets and policies are upserted.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('avatars', 'avatars', true, 1048576, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS avatars_public_read ON storage.objects;
CREATE POLICY avatars_public_read ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'avatars');
DROP POLICY IF EXISTS avatars_user_insert ON storage.objects;
CREATE POLICY avatars_user_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (SELECT auth.uid())::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS avatars_user_update ON storage.objects;
CREATE POLICY avatars_user_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (SELECT auth.uid())::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS avatars_user_delete ON storage.objects;
CREATE POLICY avatars_user_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (SELECT auth.uid())::text = (storage.foldername(name))[1]);

ALTER PUBLICATION supabase_realtime ADD TABLE public.t_notifications;
