-- Security audit 2026-09-29, part 2.

-- A ban blocks token refresh only; this also stops the access token still in hand.
CREATE FUNCTION public.is_banned() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND banned_until > now());
$$;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT NOT is_banned() AND EXISTS (
    SELECT 1 FROM profiles p JOIN m_roles r ON r.id = p.role_id
     WHERE p.id = auth.uid() AND r.role_name = 'Admin'
  );
$$;

-- Active override wins; a NULL override value falls back to the role.
CREATE OR REPLACE FUNCTION public.has_permission(p_feature_key text, p_action text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT NOT is_banned() AND COALESCE(
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

CREATE OR REPLACE FUNCTION public.has_any_access() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT NOT is_banned() AND (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role_id IS NOT NULL)
    OR EXISTS (SELECT 1 FROM t_user_access_override WHERE user_id = auth.uid() AND is_override_active));
$$;

-- Anonymous reports are bucketed per client IP, so one flooder cannot mute
-- everyone's failed logins; a global cap still bounds the table.
CREATE OR REPLACE FUNCTION public.log_client_error(p_source text, p_message text, p_context jsonb DEFAULT NULL) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  h    json := NULLIF(current_setting('request.headers', true), '')::json;
  v_ip text := left(COALESCE(h->>'cf-connecting-ip', trim(split_part(h->>'x-forwarded-for', ',', 1))), 64);
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF (SELECT count(*) FROM t_error_log
         WHERE user_id = auth.uid() AND created_at > now() - interval '1 minute') >= 20 THEN
      RETURN;
    END IF;
  ELSIF (SELECT count(*) FILTER (WHERE context->>'ip' IS NOT DISTINCT FROM v_ip) >= 20 OR count(*) >= 600
           FROM t_error_log WHERE user_id IS NULL AND created_at > now() - interval '1 minute') THEN
    RETURN;
  END IF;
  INSERT INTO t_error_log (user_id, source, message, context)
  VALUES (auth.uid(), left(p_source, 64), left(p_message, 1000),
          CASE WHEN jsonb_typeof(p_context) = 'object' AND length(p_context::text) <= 4000 THEN p_context ELSE '{}' END
            || jsonb_build_object('ip', v_ip));
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_monitor() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'storage'
    AS $$
BEGIN
  IF NOT is_superadmin() THEN
    RAISE EXCEPTION 'Superadmin only' USING errcode = '42501';
  END IF;
  RETURN jsonb_build_object(
    'failed_logins', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.created_at DESC), '[]')
        FROM (SELECT context->>'email' AS email, context->>'ip' AS ip, message, created_at FROM t_error_log
               WHERE source = 'auth.login' AND created_at >= now() - interval '7 days'
               ORDER BY created_at DESC LIMIT 20) x),
    'inactive_accounts', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.last_sign_in_at NULLS FIRST), '[]')
        FROM (SELECT p.full_name, u.email, u.last_sign_in_at FROM profiles p JOIN auth.users u ON u.id = p.id
               WHERE NOT p.is_superadmin AND (u.banned_until IS NULL OR u.banned_until <= now())
                 AND (u.last_sign_in_at IS NULL OR u.last_sign_in_at < now() - interval '30 days')) x),
    'access_changes', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.created_at DESC), '[]')
        FROM (SELECT a.action, a.entity_type, a.entity_id, a.created_at, p.full_name AS actor
                FROM t_audit_log a LEFT JOIN profiles p ON p.id = a.actor_id
               WHERE a.entity_type IN ('user', 'role_permission', 'access_override', 'api_key', 'webhook')
                  OR (a.entity_type = 'profile' AND a.action = 'update'
                      AND (a.detail->'before'->'role_id' IS DISTINCT FROM a.detail->'after'->'role_id'
                        OR a.detail->'before'->'is_superadmin' IS DISTINCT FROM a.detail->'after'->'is_superadmin'))
               ORDER BY a.created_at DESC LIMIT 20) x),
    -- Keys close to the 60/minute limit in the last hour, and keys still tried after revoking.
    'api_keys', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.peak DESC), '[]')
        FROM (SELECT k.name, k.prefix, k.revoked_at IS NOT NULL AS revoked, max(m.n) AS peak,
                     count(*) FILTER (WHERE k.revoked_at IS NOT NULL AND m.minute > k.revoked_at) AS after_revoke
                FROM t_api_keys k
                JOIN (SELECT api_key_id, date_trunc('minute', created_at) AS minute, count(*) AS n
                        FROM t_api_request_log WHERE created_at >= now() - interval '1 hour' GROUP BY 1, 2) m
                  ON m.api_key_id = k.id
               GROUP BY k.id
              HAVING max(m.n) >= 45 OR count(*) FILTER (WHERE k.revoked_at IS NOT NULL AND m.minute > k.revoked_at) > 0) x),
    'webhooks', (
      SELECT COALESCE(jsonb_agg(x), '[]')
        FROM (SELECT w.url, w.is_active, w.disabled_reason, w.failure_streak,
                     (SELECT count(*) FROM t_webhook_deliveries d WHERE d.webhook_id = w.id AND d.status = 'failed') AS failed
                FROM t_webhooks w
               WHERE NOT w.is_active OR w.failure_streak > 0
                  OR EXISTS (SELECT 1 FROM t_webhook_deliveries d WHERE d.webhook_id = w.id AND d.status = 'failed')) x),
    'storage', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.bytes DESC), '[]')
        FROM (SELECT bucket_id AS bucket, count(*) AS files, COALESCE(sum((metadata->>'size')::bigint), 0) AS bytes
                FROM storage.objects GROUP BY bucket_id) x),
    'errors', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.created_at DESC), '[]')
        FROM (SELECT e.source, e.message, e.created_at, p.full_name AS user_name
                FROM t_error_log e LEFT JOIN profiles p ON p.id = e.user_id
               WHERE e.source <> 'auth.login' ORDER BY e.created_at DESC LIMIT 20) x)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_banned(), public.is_admin(), public.has_permission(text, text), public.has_any_access(),
  public.log_client_error(text, text, jsonb), public.superadmin_monitor() FROM PUBLIC, anon;
-- Failed logins are logged before a session exists.
GRANT EXECUTE ON FUNCTION public.log_client_error(text, text, jsonb) TO anon;
