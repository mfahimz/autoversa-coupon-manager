-- 1. Truncate contacts and wave logs
TRUNCATE TABLE public.broadcast_contacts;
TRUNCATE TABLE public.broadcast_wave_logs;

-- 2. Reset send state to clean initial state
UPDATE public.broadcast_send_state
SET current_wave_count = 0,
    wave_target = 0,
    cooldown_until = NULL,
    last_sent_at = NULL,
    waves_completed_today = 0,
    daily_period_started_at = NULL,
    daily_override_extra = 0,
    current_wave_started_at = NULL,
    updated_at = now()
WHERE id = 1;

-- 3. Ensure broadcast_wave_logs has full table-level grants (matching 202609110003_fix_broadcast_table_grants.sql)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_wave_logs TO anon, authenticated, service_role;

-- 4. Enable RLS and configure policies
ALTER TABLE public.broadcast_wave_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active admins and managers can view broadcast wave logs" ON public.broadcast_wave_logs;
DROP POLICY IF EXISTS "Active users with permission can view broadcast wave logs" ON public.broadcast_wave_logs;
DROP POLICY IF EXISTS "Service role full access to broadcast wave logs" ON public.broadcast_wave_logs;

CREATE POLICY "Active users with permission can view broadcast wave logs"
  ON public.broadcast_wave_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_active IS TRUE
        AND (
          p.user_role IN ('ADMIN', 'MANAGER')
          OR EXISTS (
            SELECT 1 FROM public.role_permissions rp
            WHERE rp.role = p.user_role
              AND rp.resource = 'page:broadcast-outreach-overview'
              AND rp.action = 'view'
              AND rp.is_allowed = true
          )
        )
    )
  );

CREATE POLICY "Service role full access to broadcast wave logs"
  ON public.broadcast_wave_logs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 5. Ensure record_broadcast_contact_sent logs cleanly with robust operator name
CREATE OR REPLACE FUNCTION public.record_broadcast_contact_sent(p_contact_id uuid)
RETURNS TABLE (
  sent_at timestamptz,
  current_wave_count integer,
  wave_target integer,
  cooldown_until timestamptz,
  waves_completed_today integer,
  daily_period_started_at timestamptz,
  daily_override_extra integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile record;
  v_contact record;
  v_settings record;
  v_state record;
  v_new_count integer;
  v_new_target integer;
  v_new_cooldown timestamptz;
  v_waves_today integer;
  v_period_start timestamptz;
  v_override integer;
  v_wave_started_at timestamptz;
  v_operator_name text;
  v_sent_at timestamptz := now();
BEGIN
  SELECT user_role, is_active, full_name, email INTO v_profile FROM profiles WHERE id = auth.uid();
  IF NOT FOUND OR v_profile.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'You are not allowed to send broadcast messages';
  END IF;

  IF v_profile.user_role <> 'ADMIN' AND NOT EXISTS (
    SELECT 1 FROM role_permissions
    WHERE role = v_profile.user_role
      AND resource = 'action:broadcast_contacts:send_message'
      AND action = 'action'
      AND is_allowed = true
  ) THEN
    RAISE EXCEPTION 'You are not allowed to send broadcast messages';
  END IF;

  INSERT INTO broadcast_send_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  SELECT * INTO v_contact FROM broadcast_contacts WHERE id = p_contact_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Broadcast contact was not found'; END IF;
  IF v_contact.sent_at IS NOT NULL THEN RAISE EXCEPTION 'This contact has already been marked as sent'; END IF;

  SELECT * INTO v_settings FROM broadcast_settings WHERE id = 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Broadcast send settings have not been configured'; END IF;
  SELECT * INTO v_state FROM broadcast_send_state WHERE id = 1 FOR UPDATE;

  v_period_start := v_state.daily_period_started_at;
  v_waves_today := v_state.waves_completed_today;
  v_override := v_state.daily_override_extra;
  IF v_period_start IS NULL OR v_sent_at >= v_period_start + interval '24 hours' THEN
    v_period_start := v_sent_at;
    v_waves_today := 0;
    v_override := 0;
  END IF;

  IF v_state.cooldown_until IS NOT NULL AND v_state.cooldown_until > v_sent_at THEN
    RAISE EXCEPTION 'Sending is paused until %', v_state.cooldown_until;
  END IF;
  IF v_waves_today >= v_settings.daily_wave_target + v_override THEN
    RAISE EXCEPTION 'Daily wave limit has been reached';
  END IF;

  IF v_state.wave_target IS NULL OR v_state.wave_target = 0 THEN
    v_state.wave_target := v_settings.wave_min + floor(random() * (v_settings.wave_max - v_settings.wave_min + 1))::integer;
  END IF;
  v_wave_started_at := COALESCE(v_state.current_wave_started_at, v_sent_at);
  v_new_count := v_state.current_wave_count + 1;
  v_operator_name := COALESCE(NULLIF(TRIM(v_profile.full_name), ''), v_profile.email, 'Operator');

  IF v_new_count >= v_state.wave_target THEN
    v_new_count := 0;
    v_new_target := v_settings.wave_min + floor(random() * (v_settings.wave_max - v_settings.wave_min + 1))::integer;
    v_new_cooldown := v_sent_at + (v_settings.cooldown_min_minutes + floor(random() * (v_settings.cooldown_max_minutes - v_settings.cooldown_min_minutes + 1))) * interval '1 minute';
    v_waves_today := v_waves_today + 1;

    INSERT INTO broadcast_wave_logs (
      daily_period_started_at, daily_wave_number, message_target, messages_sent,
      started_at, completed_at, duration_seconds, cooldown_until, cooldown_minutes,
      completed_by, completed_by_name
    ) VALUES (
      v_period_start, v_waves_today, v_state.wave_target, v_state.wave_target,
      v_wave_started_at, v_sent_at, GREATEST(0, EXTRACT(EPOCH FROM v_sent_at - v_wave_started_at)::integer),
      v_new_cooldown, GREATEST(0, EXTRACT(EPOCH FROM v_new_cooldown - v_sent_at)::integer / 60),
      auth.uid(), v_operator_name
    );
  ELSE
    v_new_target := v_state.wave_target;
    -- Hardcoded randomized cooldown between 60 and 90 seconds within an active wave
    v_new_cooldown := v_sent_at + (60 + floor(random() * 31))::integer * interval '1 second';
  END IF;

  UPDATE broadcast_contacts SET sent_at = v_sent_at, sent_by = auth.uid() WHERE id = p_contact_id;
  UPDATE broadcast_send_state
  SET current_wave_count = v_new_count, wave_target = v_new_target, cooldown_until = v_new_cooldown,
      last_sent_at = v_sent_at, updated_at = v_sent_at, waves_completed_today = v_waves_today,
      daily_period_started_at = v_period_start, daily_override_extra = v_override,
      current_wave_started_at = CASE WHEN v_new_count = 0 THEN NULL ELSE v_wave_started_at END
  WHERE id = 1;

  RETURN QUERY SELECT v_sent_at, v_new_count, v_new_target, v_new_cooldown, v_waves_today, v_period_start, v_override;
END;
$$;

REVOKE ALL ON FUNCTION public.record_broadcast_contact_sent(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_broadcast_contact_sent(uuid) TO authenticated;
