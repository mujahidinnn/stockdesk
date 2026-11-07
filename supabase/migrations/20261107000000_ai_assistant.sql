-- AI assistant: conversations, per-account daily quota, retention.
-- Browser clients only read; the edge function writes messages with the service role.

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE TABLE public.t_ai_conversations (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX t_ai_conversations_user_idx ON public.t_ai_conversations (user_id, updated_at DESC);
CREATE INDEX t_ai_conversations_updated_idx ON public.t_ai_conversations (updated_at);

CREATE TABLE public.t_ai_messages (
  id              bigserial PRIMARY KEY,
  conversation_id bigint NOT NULL REFERENCES public.t_ai_conversations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant')),
  content         jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX t_ai_messages_conv_idx ON public.t_ai_messages (conversation_id, id);

CREATE TABLE public.t_ai_usage (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day     date NOT NULL,
  count   int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE public.m_ai_settings (
  id          boolean PRIMARY KEY DEFAULT true CHECK (id),
  daily_limit int NOT NULL DEFAULT 30 CHECK (daily_limit BETWEEN 0 AND 1000)
);
INSERT INTO public.m_ai_settings (daily_limit) VALUES (30);

ALTER TABLE public.t_ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m_ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_conv_select ON public.t_ai_conversations FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY ai_conv_delete ON public.t_ai_conversations FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY ai_msg_select ON public.t_ai_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.t_ai_conversations c WHERE c.id = conversation_id AND c.user_id = (SELECT auth.uid())));
CREATE POLICY ai_settings_select ON public.m_ai_settings FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.t_ai_usage, public.t_ai_conversations, public.t_ai_messages, public.m_ai_settings FROM anon, authenticated;
GRANT SELECT, DELETE ON public.t_ai_conversations TO authenticated;
GRANT SELECT ON public.t_ai_messages, public.m_ai_settings TO authenticated;

-- The quota day is the Jakarta calendar date, whatever the session time zone.
CREATE FUNCTION public.ai_day(ts timestamptz DEFAULT now()) RETURNS date
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT (ts AT TIME ZONE 'Asia/Jakarta')::date;
$$;

-- Remaining quota after counting this call.
CREATE FUNCTION public.ai_consume_quota() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limit int;
  v_count int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT daily_limit INTO v_limit FROM m_ai_settings;
  IF v_limit IS NULL OR v_limit <= 0 THEN RAISE EXCEPTION 'quota_exceeded'; END IF;
  INSERT INTO t_ai_usage AS u (user_id, day, count)
  VALUES (auth.uid(), ai_day(), 1)
  ON CONFLICT (user_id, day) DO UPDATE SET count = u.count + 1 WHERE u.count < v_limit
  RETURNING u.count INTO v_count;
  IF v_count IS NULL THEN RAISE EXCEPTION 'quota_exceeded'; END IF;
  RETURN v_limit - v_count;
END;
$$;

CREATE FUNCTION public.ai_quota_today() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'used', COALESCE((SELECT count FROM t_ai_usage WHERE user_id = auth.uid() AND day = ai_day()), 0),
    'limit', (SELECT daily_limit FROM m_ai_settings));
$$;

REVOKE ALL ON FUNCTION public.ai_day(timestamptz), public.ai_consume_quota(), public.ai_quota_today() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_day(timestamptz), public.ai_consume_quota(), public.ai_quota_today() TO authenticated;

-- 02:00 WIB daily.
SELECT cron.schedule('ai-retention', '0 19 * * *', $job$
  DELETE FROM public.t_ai_conversations WHERE updated_at < now() - interval '30 days';
  DELETE FROM public.t_ai_usage WHERE day < public.ai_day() - 7;
$job$);
