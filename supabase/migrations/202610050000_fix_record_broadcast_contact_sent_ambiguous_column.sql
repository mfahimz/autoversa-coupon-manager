-- Fix column reference "sent_at" is ambiguous in record_broadcast_contact_sent
-- By setting #variable_conflict use_column and explicitly qualifying all table columns.

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
#variable_conflict use_column
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
  v_messages_sent_today integer;
  v_sent_at timestamptz := now();
BEGIN
  SELECT p.user_role, p.is_active, p.full_name, p.email INTO v_profile FROM profiles p WHERE p.id = auth.uid();
  IF NOT FOUND OR v_profile.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'You are not allowed to send broadcast messages';
  END IF;

  IF v_profile.user_role <> 'ADMIN' AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role = v_profile.user_role
      AND rp.resource = 'action:broadcast_contacts:send_message'
      AND rp.action = 'action'
      AND rp.is_allowed = true
  ) THEN
    RAISE EXCEPTION 'You are not allowed to send broadcast messages';
  END IF;

  SELECT * INTO v_contact FROM broadcast_contacts bc WHERE bc.id = p_contact_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Broadcast contact not found'; END IF;

  SELECT * INTO v_settings FROM broadcast_settings bs WHERE bs.id = 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Broadcast send settings have not been configured'; END IF;

  SELECT * INTO v_state FROM broadcast_send_state bss WHERE bss.id = 1 FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO broadcast_send_state (id, current_wave_count, wave_target, cooldown_until, waves_completed_today, daily_period_started_at, daily_override_extra, health_score)
    VALUES (1, 0, 0, NULL, 0, now(), 0, 100);
    SELECT * INTO v_state FROM broadcast_send_state bss WHERE bss.id = 1 FOR UPDATE;
  END IF;

  v_score := COALESCE(v_state.health_score, 100);
  v_uae_day_start := date_trunc('day', v_sent_at AT TIME ZONE 'Asia/Dubai') AT TIME ZONE 'Asia/Dubai';

  -- Daily period rollover at midnight UAE time
  IF v_state.daily_period_started_at IS NULL THEN
    v_period_start := v_uae_day_start;
    v_waves_today := 0;
    v_override := 0;
    -- Clean reset: partial waves must not leak across day boundaries
    v_state.current_wave_count := 0;
    v_state.current_wave_started_at := NULL;
    v_state.wave_target := 0;
    v_state.cooldown_until := NULL;
  ELSIF (v_state.daily_period_started_at AT TIME ZONE 'Asia/Dubai')::date < (v_sent_at AT TIME ZONE 'Asia/Dubai')::date THEN
    v_period_start := v_state.daily_period_started_at;
    IF v_score < 100 THEN
      v_days_rolled := GREATEST(1, (v_sent_at AT TIME ZONE 'Asia/Dubai')::date - (v_period_start AT TIME ZONE 'Asia/Dubai')::date);
      v_recovery := v_days_rolled * (CASE
        WHEN v_state.last_negative_at IS NULL OR v_state.last_negative_at < v_sent_at - interval '24 hours' THEN 10
        ELSE 5
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
    -- Clean reset: partial waves must not leak across day boundaries
    v_state.current_wave_count := 0;
    v_state.current_wave_started_at := NULL;
    v_state.wave_target := 0;
    IF v_state.cooldown_until IS NOT NULL AND v_state.cooldown_until <= v_sent_at THEN
      v_state.cooldown_until := NULL;
    END IF;

    -- Self-Sufficient Multi-Day Plateau + Organic Fluctuation Ramp:
    -- Rather than an artificial geometric jump every single day, the algorithm stays on each
    -- volume plateau for 3 to 4 days, with natural daily fluctuations (±1 to ±3 msgs) to
    -- completely disarm WhatsApp automated bot detection heuristics.
    -- Once the required plateau days are completed cleanly (Health >= 85, 0 failures),
    -- it takes a gentle step to the next tier.
    IF v_settings.adaptive_enabled IS TRUE THEN
      DECLARE
        v_base_cap integer := COALESCE(v_state.tier_base_cap, 25);
        v_days_in_tier integer := COALESCE(v_state.days_at_current_tier, 1);
        v_required_plateau_days integer;
        v_next_base_cap integer;
        v_today_effective_cap integer;
        v_jitter integer := 0;
      BEGIN
        -- Slower, gentle ramp: 4 days required per tier for base <= 50, 3 days for higher tiers
        IF v_base_cap <= 50 THEN
          v_required_plateau_days := 4;
        ELSE
          v_required_plateau_days := 3;
        END IF;

        IF v_score >= 85 AND COALESCE(v_state.consecutive_failures, 0) = 0 THEN
          IF v_days_in_tier < v_required_plateau_days THEN
            -- Stay on current plateau tier and increment day counter
            v_days_in_tier := v_days_in_tier + 1;
            v_state.days_at_current_tier := v_days_in_tier;

            -- Organic human variance (±1 to ±2 messages) within current plateau
            IF v_days_in_tier = 2 THEN
              v_jitter := 1;
            ELSIF v_days_in_tier = 3 THEN
              v_jitter := -1;
            ELSIF v_days_in_tier = 4 THEN
              v_jitter := CASE WHEN v_base_cap >= 32 THEN 1 ELSE 0 END;
            ELSE
              v_jitter := 0;
            END IF;

            v_today_effective_cap := GREATEST(10, v_base_cap + v_jitter);
            UPDATE broadcast_settings bs SET max_daily_messages = v_today_effective_cap WHERE bs.id = 1;
            v_settings.max_daily_messages := v_today_effective_cap;

            INSERT INTO broadcast_health_events (event_type, score_before, score_after, actor, actor_name, note)
            VALUES ('plateau_day_active', v_score, v_score, auth.uid(), 'Plateau Algorithm',
                    'Plateau day ' || v_days_in_tier || '/' || v_required_plateau_days || ' at base ' || v_base_cap || ' msgs (today cap: ' || v_today_effective_cap || ' with ' || CASE WHEN v_jitter >= 0 THEN '+' || v_jitter ELSE v_jitter::text END || ' human fluctuation)');
          ELSE
            -- Required plateau days completed with healthy metrics! Step up to next gentle plateau tier.
            IF v_base_cap < 32 THEN v_next_base_cap := 32;
            ELSIF v_base_cap < 40 THEN v_next_base_cap := 40;
            ELSIF v_base_cap < 50 THEN v_next_base_cap := 50;
            ELSIF v_base_cap < 62 THEN v_next_base_cap := 62;
            ELSIF v_base_cap < 75 THEN v_next_base_cap := 75;
            ELSIF v_base_cap < 90 THEN v_next_base_cap := 90;
            ELSIF v_base_cap < 110 THEN v_next_base_cap := 110;
            ELSIF v_base_cap < 130 THEN v_next_base_cap := 130;
            ELSIF v_base_cap < 150 THEN v_next_base_cap := 150;
            ELSE v_next_base_cap := v_base_cap;
            END IF;

            v_state.days_at_current_tier := 1;
            v_state.tier_base_cap := v_next_base_cap;
            UPDATE broadcast_settings bs SET max_daily_messages = v_next_base_cap WHERE bs.id = 1;
            v_settings.max_daily_messages := v_next_base_cap;

            IF v_next_base_cap > v_base_cap THEN
              INSERT INTO broadcast_health_events (event_type, score_before, score_after, actor, actor_name, note)
              VALUES ('plateau_tier_advanced', v_score, v_score, auth.uid(), 'Plateau Algorithm',
                      'Completed ' || v_required_plateau_days || ' healthy days at ' || v_base_cap || ' msgs plateau. Advanced gently to ' || v_next_base_cap || ' msgs plateau.');
            END IF;
          END IF;
        ELSIF v_score < 65 OR COALESCE(v_state.consecutive_failures, 0) >= 2 THEN
          -- Delivery friction detected: step down to previous safe plateau
          IF v_base_cap > 75 THEN v_next_base_cap := 62;
          ELSIF v_base_cap > 62 THEN v_next_base_cap := 50;
          ELSIF v_base_cap > 50 THEN v_next_base_cap := 40;
          ELSIF v_base_cap > 40 THEN v_next_base_cap := 32;
          ELSIF v_base_cap > 32 THEN v_next_base_cap := 25;
          ELSE v_next_base_cap := 15;
          END IF;

          v_state.days_at_current_tier := 1;
          v_state.tier_base_cap := v_next_base_cap;
          UPDATE broadcast_settings bs SET max_daily_messages = v_next_base_cap WHERE bs.id = 1;
          v_settings.max_daily_messages := v_next_base_cap;

          INSERT INTO broadcast_health_events (event_type, score_before, score_after, actor, actor_name, note)
          VALUES ('plateau_tier_stepped_down', v_score, v_score, auth.uid(), 'Plateau Safety Guard',
                  'Health degraded (score ' || v_score || ', failures: ' || COALESCE(v_state.consecutive_failures, 0) || '). Stepped down from ' || v_base_cap || ' to ' || v_next_base_cap || ' msgs plateau.');
        END IF;
      END;
    END IF;
  ELSE
    v_period_start := v_state.daily_period_started_at;
    v_waves_today := COALESCE(v_state.waves_completed_today, 0);
    v_override := COALESCE(v_state.daily_override_extra, 0);
  END IF;

  -- Anti-Block Safety Ceiling: strictly enforce max_daily_messages
  SELECT count(*)::integer INTO v_messages_sent_today
  FROM broadcast_contacts bc
  WHERE bc.sent_at >= v_period_start;

  IF v_settings.max_daily_messages IS NOT NULL AND v_messages_sent_today >= v_settings.max_daily_messages THEN
    RAISE EXCEPTION 'Daily safety limit of % messages reached today. Sending is paused to protect account from WhatsApp blocks.', v_settings.max_daily_messages;
  END IF;

  -- Warm-up: starts on first send, restarts only after 30+ dormant days
  IF v_state.last_sent_at IS NOT NULL AND v_state.last_sent_at < v_sent_at - interval '30 days' THEN
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
    v_history.recent_neg_rate, v_history.history_wave_cap,
    COALESCE(v_settings.max_daily_messages, 25),
    COALESCE(v_settings.intra_delay_min_seconds, 15),
    COALESCE(v_settings.intra_delay_max_seconds, 30)
  );

  IF v_state.cooldown_until IS NOT NULL AND v_state.cooldown_until > v_sent_at THEN
    RAISE EXCEPTION 'Sending is paused until %', v_state.cooldown_until;
  END IF;
  IF v_waves_today >= v_params.eff_daily_wave_target + v_override THEN
    RAISE EXCEPTION 'Daily wave limit has been reached';
  END IF;

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
    -- Batch cooldown: random interval between min and max cooldown minutes
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
    -- Human intra-message delay: randomized jitter between min and max seconds
    v_new_cooldown := v_sent_at + (v_params.intra_delay_min_seconds + floor(random() * (v_params.intra_delay_max_seconds - v_params.intra_delay_min_seconds + 1)))::integer * interval '1 second';
  END IF;

  UPDATE broadcast_contacts bc
  SET sent_at = v_sent_at, sent_by = auth.uid(), delivery_status = 'delivered', status_updated_at = v_sent_at, status_updated_by = auth.uid()
  WHERE bc.id = p_contact_id;

  UPDATE broadcast_send_state bss
  SET current_wave_count = v_new_count, wave_target = v_new_target, cooldown_until = v_new_cooldown,
      last_sent_at = v_sent_at, updated_at = v_sent_at, waves_completed_today = v_waves_today,
      daily_period_started_at = v_period_start, daily_override_extra = v_override,
      current_wave_started_at = CASE WHEN v_new_count = 0 THEN NULL ELSE v_wave_started_at END,
      health_score = v_score, warmup_started_at = v_warmup_started,
      days_at_current_tier = COALESCE(v_state.days_at_current_tier, 1),
      tier_base_cap = COALESCE(v_state.tier_base_cap, 25)
  WHERE bss.id = 1;

  RETURN QUERY SELECT
    v_sent_at,
    v_new_count,
    v_new_target,
    v_new_cooldown,
    v_waves_today,
    v_period_start,
    v_override,
    v_score,
    v_params.health_tier,
    v_params.eff_daily_wave_target;
END;
$$;

REVOKE ALL ON FUNCTION public.record_broadcast_contact_sent(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_broadcast_contact_sent(uuid) TO authenticated, service_role;

-- Also protect get_broadcast_throttle_status from any variable/column conflict
CREATE OR REPLACE FUNCTION public.get_broadcast_throttle_status()
RETURNS TABLE (
  adaptive_enabled boolean,
  health_score numeric,
  health_tier text,
  consecutive_failures integer,
  last_health_event text,
  warmup_started_at timestamptz,
  warmup_day integer,
  factor numeric,
  health_factor numeric,
  warmup_factor numeric,
  history_factor numeric,
  recent_neg_rate numeric,
  recent_outcomes integer,
  history_wave_cap integer,
  avg_waves_per_day numeric,
  eff_wave_min integer,
  eff_wave_max integer,
  eff_cooldown_min_minutes integer,
  eff_cooldown_max_minutes integer,
  eff_daily_wave_target integer,
  intra_delay_min_seconds integer,
  intra_delay_max_seconds integer,
  max_daily_messages integer,
  messages_sent_today integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_settings record;
  v_state record;
  v_history record;
  v_score numeric;
  v_warmup_started timestamptz;
  v_uae_day_start timestamptz;
  v_messages_sent_today integer;
  v_now timestamptz := now();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_active IS TRUE) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT * INTO v_settings FROM broadcast_settings bs WHERE bs.id = 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Broadcast send settings have not been configured'; END IF;
  SELECT * INTO v_state FROM broadcast_send_state bss WHERE bss.id = 1;

  v_score := COALESCE(v_state.health_score, 100);
  v_warmup_started := v_state.warmup_started_at;
  SELECT * INTO v_history FROM broadcast_history_signals(v_now);

  v_uae_day_start := date_trunc('day', v_now AT TIME ZONE 'Asia/Dubai') AT TIME ZONE 'Asia/Dubai';
  SELECT count(*)::integer INTO v_messages_sent_today
  FROM broadcast_contacts bc
  WHERE bc.sent_at >= v_uae_day_start;

  RETURN QUERY
  SELECT
    v_settings.adaptive_enabled,
    v_score,
    p.health_tier,
    COALESCE(v_state.consecutive_failures, 0),
    v_state.last_health_event,
    v_warmup_started,
    p.warmup_day,
    p.factor,
    p.health_factor,
    p.warmup_factor,
    p.history_factor,
    v_history.recent_neg_rate,
    v_history.recent_outcomes,
    v_history.history_wave_cap,
    v_history.avg_waves_per_day,
    p.eff_wave_min,
    p.eff_wave_max,
    p.eff_cooldown_min_minutes,
    p.eff_cooldown_max_minutes,
    p.eff_daily_wave_target,
    p.intra_delay_min_seconds,
    p.intra_delay_max_seconds,
    v_settings.max_daily_messages,
    v_messages_sent_today
  FROM broadcast_throttle_params(
    v_settings.adaptive_enabled, v_score, v_warmup_started, v_now,
    v_settings.wave_min, v_settings.wave_max,
    v_settings.cooldown_min_minutes, v_settings.cooldown_max_minutes,
    v_settings.daily_wave_target,
    v_history.recent_neg_rate, v_history.history_wave_cap,
    COALESCE(v_settings.max_daily_messages, 25),
    COALESCE(v_settings.intra_delay_min_seconds, 15),
    COALESCE(v_settings.intra_delay_max_seconds, 30)
  ) p;
END;
$$;

REVOKE ALL ON FUNCTION public.get_broadcast_throttle_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_broadcast_throttle_status() TO authenticated, service_role, anon;
