-- Daily wave counters reset at midnight UAE time (Asia/Dubai, UTC+4) instead
-- of a rolling 24-hour window from the first send. The stored
-- daily_period_started_at now always sits on a UAE midnight boundary, and the
-- history learner counts "days" as UAE calendar days too.

CREATE OR REPLACE FUNCTION public.broadcast_history_signals(p_at timestamptz)
RETURNS TABLE (
  recent_neg_rate numeric,
  recent_outcomes integer,
  history_wave_cap integer,
  avg_waves_per_day numeric
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_total integer;
  v_neg integer;
  v_waves integer;
  v_active_days integer;
  v_avg numeric;
  v_uae_today_start timestamptz;
BEGIN
  v_uae_today_start := date_trunc('day', p_at AT TIME ZONE 'Asia/Dubai') AT TIME ZONE 'Asia/Dubai';

  SELECT count(*)::integer,
         count(*) FILTER (WHERE delivery_status IN ('failed', 'opted_out'))::integer
  INTO v_total, v_neg
  FROM broadcast_contacts
  WHERE delivery_status IN ('delivered', 'replied', 'failed', 'opted_out')
    AND status_updated_at >= p_at - interval '7 days';

  -- Waves from the previous 7 UAE calendar days, excluding today, so today's
  -- own sends cannot raise today's cap.
  SELECT count(*)::integer, count(DISTINCT (completed_at AT TIME ZONE 'Asia/Dubai')::date)::integer
  INTO v_waves, v_active_days
  FROM broadcast_wave_logs
  WHERE completed_at >= v_uae_today_start - interval '7 days'
    AND completed_at < v_uae_today_start;

  IF v_active_days > 0 THEN
    v_avg := v_waves::numeric / v_active_days;
  ELSE
    v_avg := NULL;
  END IF;

  RETURN QUERY SELECT
    CASE WHEN v_total >= 10 THEN round(v_neg::numeric / v_total, 3) ELSE NULL END,
    v_total,
    -- No completed waves before today means a cold start: hold to 3 waves.
    CASE WHEN v_avg IS NULL THEN 3 ELSE GREATEST(3, ceil(v_avg * 1.3)::integer) END,
    round(COALESCE(v_avg, 0), 2);
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_history_signals(timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.record_broadcast_contact_sent(p_contact_id uuid)
RETURNS TABLE (
  sent_at timestamptz,
  current_wave_count integer,
  wave_target integer,
  cooldown_until timestamptz,
  waves_completed_today integer,
  daily_period_started_at timestamptz,
  daily_override_extra integer,
  health_score numeric,
  health_tier text,
  eff_daily_wave_target integer
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
  v_params record;
  v_new_count integer;
  v_new_target integer;
  v_new_cooldown timestamptz;
  v_waves_today integer;
  v_period_start timestamptz;
  v_override integer;
  v_wave_started_at timestamptz;
  v_wave_target_now integer;
  v_operator_name text;
  v_score numeric;
  v_recovery numeric;
  v_days_rolled integer;
  v_warmup_started timestamptz;
  v_history record;
  v_uae_day_start timestamptz;
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
  v_score := COALESCE(v_state.health_score, 60);

  -- Daily rollover at midnight UAE time: reset counters and let the health
  -- score recover slowly for each elapsed UAE calendar day.
  v_uae_day_start := date_trunc('day', v_sent_at AT TIME ZONE 'Asia/Dubai') AT TIME ZONE 'Asia/Dubai';
  IF v_period_start IS NULL OR v_period_start < v_uae_day_start THEN
    IF v_period_start IS NOT NULL THEN
      v_days_rolled := GREATEST(1, (v_sent_at AT TIME ZONE 'Asia/Dubai')::date - (v_period_start AT TIME ZONE 'Asia/Dubai')::date);
      v_recovery := v_days_rolled * (CASE
        WHEN v_state.last_negative_at IS NULL OR v_state.last_negative_at < v_sent_at - interval '24 hours' THEN 6
        ELSE 2
      END);
      IF v_recovery > 0 AND v_score < 100 THEN
        INSERT INTO broadcast_health_events (event_type, score_before, score_after, actor, actor_name, note)
        VALUES ('daily_recovery', v_score, LEAST(100, v_score + v_recovery), auth.uid(), COALESCE(NULLIF(TRIM(v_profile.full_name), ''), v_profile.email, 'Operator'),
                v_days_rolled || ' day(s) elapsed, +' || v_recovery || ' recovery');
        v_score := LEAST(100, v_score + v_recovery);
      END IF;
    END IF;
    v_period_start := v_uae_day_start;
    v_waves_today := 0;
    v_override := 0;
  END IF;

  -- Warm-up: starts on the first ever send, restarts after 14+ dormant days.
  IF v_state.last_sent_at IS NOT NULL AND v_state.last_sent_at < v_sent_at - interval '14 days' THEN
    v_warmup_started := v_sent_at;
  ELSE
    v_warmup_started := COALESCE(v_state.warmup_started_at, v_sent_at);
  END IF;

  SELECT * INTO v_history FROM broadcast_history_signals(v_sent_at);
  SELECT * INTO v_params FROM broadcast_throttle_params(
    v_settings.adaptive_enabled, v_score, v_warmup_started, v_sent_at,
    v_settings.wave_min, v_settings.wave_max,
    v_settings.cooldown_min_minutes, v_settings.cooldown_max_minutes,
    v_settings.daily_wave_target,
    v_history.recent_neg_rate, v_history.history_wave_cap
  );

  IF v_state.cooldown_until IS NOT NULL AND v_state.cooldown_until > v_sent_at THEN
    RAISE EXCEPTION 'Sending is paused until %', v_state.cooldown_until;
  END IF;
  IF v_waves_today >= v_params.eff_daily_wave_target + v_override THEN
    RAISE EXCEPTION 'Daily wave limit has been reached';
  END IF;

  -- Wave target: roll a fresh one inside the effective range; if the plan
  -- shrank mid-wave (health dropped), the running wave is clipped to it.
  IF v_state.wave_target IS NULL OR v_state.wave_target = 0 THEN
    v_wave_target_now := v_params.eff_wave_min + floor(random() * (v_params.eff_wave_max - v_params.eff_wave_min + 1))::integer;
  ELSE
    v_wave_target_now := LEAST(v_state.wave_target, v_params.eff_wave_max);
  END IF;

  v_wave_started_at := COALESCE(v_state.current_wave_started_at, v_sent_at);
  v_new_count := v_state.current_wave_count + 1;
  v_operator_name := COALESCE(NULLIF(TRIM(v_profile.full_name), ''), v_profile.email, 'Operator');

  IF v_new_count >= v_wave_target_now THEN
    v_new_count := 0;
    v_new_target := v_params.eff_wave_min + floor(random() * (v_params.eff_wave_max - v_params.eff_wave_min + 1))::integer;
    v_new_cooldown := v_sent_at + (v_params.eff_cooldown_min_minutes + floor(random() * (v_params.eff_cooldown_max_minutes - v_params.eff_cooldown_min_minutes + 1))) * interval '1 minute';
    v_waves_today := v_waves_today + 1;

    INSERT INTO broadcast_wave_logs (
      daily_period_started_at, daily_wave_number, message_target, messages_sent,
      started_at, completed_at, duration_seconds, cooldown_until, cooldown_minutes,
      completed_by, completed_by_name
    ) VALUES (
      v_period_start, v_waves_today, v_wave_target_now, v_state.current_wave_count + 1,
      v_wave_started_at, v_sent_at, GREATEST(0, EXTRACT(EPOCH FROM v_sent_at - v_wave_started_at)::integer),
      v_new_cooldown, GREATEST(0, EXTRACT(EPOCH FROM v_new_cooldown - v_sent_at)::integer / 60),
      auth.uid(), v_operator_name
    );
  ELSE
    v_new_target := v_wave_target_now;
    v_new_cooldown := v_sent_at + (v_params.intra_delay_min_seconds + floor(random() * (v_params.intra_delay_max_seconds - v_params.intra_delay_min_seconds + 1)))::integer * interval '1 second';
  END IF;

  UPDATE broadcast_contacts
  SET sent_at = v_sent_at, sent_by = auth.uid(), delivery_status = 'sent', status_updated_at = v_sent_at, status_updated_by = auth.uid()
  WHERE id = p_contact_id;

  UPDATE broadcast_send_state
  SET current_wave_count = v_new_count, wave_target = v_new_target, cooldown_until = v_new_cooldown,
      last_sent_at = v_sent_at, updated_at = v_sent_at, waves_completed_today = v_waves_today,
      daily_period_started_at = v_period_start, daily_override_extra = v_override,
      current_wave_started_at = CASE WHEN v_new_count = 0 THEN NULL ELSE v_wave_started_at END,
      health_score = v_score, warmup_started_at = v_warmup_started
  WHERE id = 1;

  RETURN QUERY SELECT v_sent_at, v_new_count, v_new_target, v_new_cooldown, v_waves_today, v_period_start, v_override,
    v_score, public.broadcast_health_tier(v_score), v_params.eff_daily_wave_target;
END;
$$;

REVOKE ALL ON FUNCTION public.record_broadcast_contact_sent(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_broadcast_contact_sent(uuid) TO authenticated;

-- Align the stored period with the new boundary immediately so the UI and the
-- next send agree on when "today" started.
UPDATE public.broadcast_send_state
SET daily_period_started_at = date_trunc('day', daily_period_started_at AT TIME ZONE 'Asia/Dubai') AT TIME ZONE 'Asia/Dubai',
    updated_at = now()
WHERE id = 1 AND daily_period_started_at IS NOT NULL;
