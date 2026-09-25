-- Adaptive broadcast throttle
--
-- Turns the static wave/cooldown settings into ceilings and scales the live
-- send plan (wave size, cooldowns, daily cap, per-message delay) from two
-- signals, entirely server side so clients cannot bypass it:
--
--   1. Account health score (0-100). Operator-reported message outcomes move
--      it: replies and deliveries raise it, undelivered messages and opt-outs
--      lower it. Streaks of failures and reported WhatsApp warnings trigger
--      hard pauses. Quiet days recover it slowly.
--   2. Warm-up ramp. A fresh (or 14+ days dormant) sender starts at 30% of
--      the configured volume and ramps to 100% over two weeks.
--   3. Sent history. The trailing 7 days of recorded outcomes dampen the plan
--      when the failure/opt-out rate climbs, and the daily wave cap can only
--      grow ~30% above the trailing 7-day average pace, so volume ramps
--      gradually instead of spiking.
--
-- The effective plan is min(health factor, warm-up factor) * history dampener
-- applied to the admin-configured ceilings; cooldowns stretch inversely
-- (up to 3x).

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

ALTER TABLE public.broadcast_contacts
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_updated_by uuid REFERENCES public.profiles(id);

DO $$ BEGIN
  ALTER TABLE public.broadcast_contacts
    ADD CONSTRAINT broadcast_contacts_delivery_status_check
    CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'replied', 'failed', 'opted_out'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE public.broadcast_contacts SET delivery_status = 'sent'
WHERE sent_at IS NOT NULL AND delivery_status = 'pending';

ALTER TABLE public.broadcast_send_state
  ADD COLUMN IF NOT EXISTS health_score numeric(5,2) NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_negative_at timestamptz,
  ADD COLUMN IF NOT EXISTS warmup_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_health_event text;

ALTER TABLE public.broadcast_settings
  ADD COLUMN IF NOT EXISTS adaptive_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.broadcast_health_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  score_before numeric(5,2) NOT NULL,
  score_after numeric(5,2) NOT NULL,
  contact_id uuid REFERENCES public.broadcast_contacts(id) ON DELETE SET NULL,
  actor uuid REFERENCES public.profiles(id),
  actor_name text,
  note text
);

CREATE INDEX IF NOT EXISTS broadcast_health_events_created_at_idx
  ON public.broadcast_health_events (created_at DESC);

ALTER TABLE public.broadcast_health_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active admins and managers can view broadcast health events" ON public.broadcast_health_events;
CREATE POLICY "Active admins and managers can view broadcast health events"
  ON public.broadcast_health_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND is_active IS TRUE
        AND user_role IN ('ADMIN', 'MANAGER')
    )
  );

GRANT SELECT ON public.broadcast_health_events TO authenticated;

-- ---------------------------------------------------------------------------
-- Pure helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.broadcast_status_weight(p_status text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_status
    WHEN 'delivered' THEN 1
    WHEN 'replied' THEN 4
    WHEN 'failed' THEN -10
    WHEN 'opted_out' THEN -20
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.broadcast_health_tier(p_score numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_score >= 80 THEN 'excellent'
    WHEN p_score >= 60 THEN 'good'
    WHEN p_score >= 40 THEN 'guarded'
    WHEN p_score >= 20 THEN 'risky'
    ELSE 'critical'
  END;
$$;

-- History inputs (computed by callers from real sent data):
--   p_recent_neg_rate: failed + opted_out share of outcomes reported in the
--     trailing 7 days (NULL when fewer than 10 outcomes are known).
--   p_history_wave_cap: max waves allowed today based on the trailing 7-day
--     average pace (+30% growth headroom); NULL when adaptive is off.
CREATE OR REPLACE FUNCTION public.broadcast_throttle_params(
  p_adaptive boolean,
  p_health_score numeric,
  p_warmup_started timestamptz,
  p_at timestamptz,
  p_wave_min integer,
  p_wave_max integer,
  p_cooldown_min integer,
  p_cooldown_max integer,
  p_daily_target integer,
  p_recent_neg_rate numeric,
  p_history_wave_cap integer
)
RETURNS TABLE (
  factor numeric,
  health_factor numeric,
  warmup_factor numeric,
  history_factor numeric,
  warmup_day integer,
  health_tier text,
  eff_wave_min integer,
  eff_wave_max integer,
  eff_cooldown_min_minutes integer,
  eff_cooldown_max_minutes integer,
  eff_daily_wave_target integer,
  intra_delay_min_seconds integer,
  intra_delay_max_seconds integer
)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_health numeric;
  v_warmup numeric;
  v_history numeric;
  v_day integer;
  v_factor numeric;
  v_multiplier numeric;
  v_wave_min integer;
  v_daily integer;
BEGIN
  v_day := GREATEST(0, floor(EXTRACT(EPOCH FROM p_at - COALESCE(p_warmup_started, p_at)) / 86400))::integer;

  v_warmup := CASE
    WHEN v_day < 3 THEN 0.30
    WHEN v_day < 7 THEN 0.50
    WHEN v_day < 14 THEN 0.75
    ELSE 1.00
  END;

  v_health := CASE
    WHEN p_health_score >= 80 THEN 1.00
    WHEN p_health_score >= 60 THEN 0.80
    WHEN p_health_score >= 40 THEN 0.55
    WHEN p_health_score >= 20 THEN 0.30
    ELSE 0.15
  END;

  -- Learned dampener: a rising failure/opt-out rate in the recent sent
  -- history shrinks the whole plan even before the score catches up.
  v_history := CASE
    WHEN p_recent_neg_rate IS NULL THEN 1.00
    WHEN p_recent_neg_rate >= 0.30 THEN 0.50
    WHEN p_recent_neg_rate >= 0.15 THEN 0.70
    ELSE 1.00
  END;

  IF p_adaptive IS NOT TRUE THEN
    v_factor := 1.00;
    v_history := 1.00;
  ELSE
    v_factor := GREATEST(0.10, LEAST(v_health, v_warmup) * v_history);
  END IF;

  -- Cooldowns stretch as volume shrinks, capped at 3x the configured values.
  v_multiplier := LEAST(3.0, 1.0 / v_factor);
  v_wave_min := GREATEST(1, round(p_wave_min * v_factor)::integer);

  -- Daily cap: scaled target, but never more than ~30% above the recent pace.
  v_daily := GREATEST(1, round(p_daily_target * v_factor)::integer);
  IF p_adaptive IS TRUE AND p_history_wave_cap IS NOT NULL THEN
    v_daily := LEAST(v_daily, GREATEST(1, p_history_wave_cap));
  END IF;

  RETURN QUERY SELECT
    v_factor,
    v_health,
    v_warmup,
    v_history,
    v_day,
    public.broadcast_health_tier(p_health_score),
    v_wave_min,
    GREATEST(v_wave_min, round(p_wave_max * v_factor)::integer),
    GREATEST(p_cooldown_min, ceil(p_cooldown_min * v_multiplier)::integer),
    GREATEST(GREATEST(p_cooldown_min, ceil(p_cooldown_min * v_multiplier)::integer), ceil(p_cooldown_max * v_multiplier)::integer),
    v_daily,
    LEAST(120, ceil(15 * v_multiplier)::integer),
    LEAST(180, ceil(30 * v_multiplier)::integer);
END;
$$;

-- Reads the trailing 7 days of real sent history and distills the two
-- learning inputs for broadcast_throttle_params.
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
BEGIN
  SELECT count(*)::integer,
         count(*) FILTER (WHERE delivery_status IN ('failed', 'opted_out'))::integer
  INTO v_total, v_neg
  FROM broadcast_contacts
  WHERE delivery_status IN ('delivered', 'replied', 'failed', 'opted_out')
    AND status_updated_at >= p_at - interval '7 days';

  SELECT count(*)::integer, count(DISTINCT date_trunc('day', completed_at))::integer
  INTO v_waves, v_active_days
  FROM broadcast_wave_logs
  WHERE completed_at >= p_at - interval '7 days'
    AND completed_at < date_trunc('day', p_at);

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

REVOKE ALL ON FUNCTION public.broadcast_status_weight(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.broadcast_health_tier(numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.broadcast_throttle_params(boolean, numeric, timestamptz, timestamptz, integer, integer, integer, integer, integer, numeric, integer) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Send RPC: record a send and advance the wave using the adaptive plan
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.record_broadcast_contact_sent(uuid);

CREATE FUNCTION public.record_broadcast_contact_sent(p_contact_id uuid)
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

  -- Daily rollover: reset counters and let the health score recover slowly.
  IF v_period_start IS NULL OR v_sent_at >= v_period_start + interval '24 hours' THEN
    IF v_period_start IS NOT NULL THEN
      v_days_rolled := GREATEST(1, floor(EXTRACT(EPOCH FROM v_sent_at - v_period_start) / 86400))::integer;
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
    v_period_start := v_sent_at;
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

-- ---------------------------------------------------------------------------
-- Outcome reporting: operators feed the behavior signals back in
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.report_broadcast_contact_status(p_contact_id uuid, p_status text)
RETURNS TABLE (
  delivery_status text,
  health_score numeric,
  health_tier text,
  cooldown_until timestamptz,
  consecutive_failures integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile record;
  v_contact record;
  v_state record;
  v_now timestamptz := now();
  v_actor_name text;
  v_delta numeric;
  v_score numeric;
  v_score_before numeric;
  v_streak integer;
  v_cooldown timestamptz;
  v_last_negative timestamptz;
BEGIN
  IF p_status NOT IN ('delivered', 'replied', 'failed', 'opted_out') THEN
    RAISE EXCEPTION 'Invalid delivery status %', p_status;
  END IF;

  SELECT user_role, is_active, full_name, email INTO v_profile FROM profiles WHERE id = auth.uid();
  IF NOT FOUND OR v_profile.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'You are not allowed to report broadcast outcomes';
  END IF;

  IF v_profile.user_role <> 'ADMIN' AND NOT EXISTS (
    SELECT 1 FROM role_permissions
    WHERE role = v_profile.user_role
      AND resource = 'action:broadcast_contacts:send_message'
      AND action = 'action'
      AND is_allowed = true
  ) THEN
    RAISE EXCEPTION 'You are not allowed to report broadcast outcomes';
  END IF;

  SELECT * INTO v_contact FROM broadcast_contacts WHERE id = p_contact_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Broadcast contact was not found'; END IF;
  IF v_contact.sent_at IS NULL THEN RAISE EXCEPTION 'Report an outcome only for contacts that have already been sent'; END IF;
  IF v_contact.delivery_status = p_status THEN
    RETURN QUERY SELECT v_contact.delivery_status, s.health_score, public.broadcast_health_tier(s.health_score), s.cooldown_until, s.consecutive_failures
    FROM broadcast_send_state s WHERE s.id = 1;
    RETURN;
  END IF;

  INSERT INTO broadcast_send_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  SELECT * INTO v_state FROM broadcast_send_state WHERE id = 1 FOR UPDATE;

  v_actor_name := COALESCE(NULLIF(TRIM(v_profile.full_name), ''), v_profile.email, 'Operator');
  v_score := COALESCE(v_state.health_score, 60);
  v_score_before := v_score;
  v_streak := COALESCE(v_state.consecutive_failures, 0);
  v_cooldown := v_state.cooldown_until;
  v_last_negative := v_state.last_negative_at;

  -- Delta between the new outcome's weight and whatever was applied before,
  -- so re-reporting a contact corrects the score instead of double counting.
  v_delta := public.broadcast_status_weight(p_status) - public.broadcast_status_weight(v_contact.delivery_status);
  v_score := GREATEST(0, LEAST(100, v_score + v_delta));
  IF v_delta < 0 THEN v_last_negative := v_now; END IF;

  IF p_status = 'failed' THEN
    v_streak := v_streak + 1;
  ELSE
    v_streak := 0;
  END IF;

  INSERT INTO broadcast_health_events (event_type, score_before, score_after, contact_id, actor, actor_name, note)
  VALUES ('status_' || p_status, v_score_before, v_score, p_contact_id, auth.uid(), v_actor_name,
          'was ' || v_contact.delivery_status);

  -- Brake 1: three undelivered messages in a row means the account is likely
  -- being filtered. Cut the score further and pause sending for 2 hours.
  IF v_streak >= 3 THEN
    INSERT INTO broadcast_health_events (event_type, score_before, score_after, contact_id, actor, actor_name, note)
    VALUES ('failure_streak_brake', v_score, GREATEST(0, v_score - 10), p_contact_id, auth.uid(), v_actor_name, '3 consecutive failures, sending paused 2 hours');
    v_score := GREATEST(0, v_score - 10);
    v_streak := 0;
    v_cooldown := GREATEST(COALESCE(v_cooldown, v_now), v_now + interval '2 hours');
  END IF;

  -- Brake 2: falling into the critical tier pauses sending for 24 hours.
  IF v_score_before >= 20 AND v_score < 20 THEN
    INSERT INTO broadcast_health_events (event_type, score_before, score_after, contact_id, actor, actor_name, note)
    VALUES ('critical_pause', v_score, v_score, p_contact_id, auth.uid(), v_actor_name, 'health critical, sending paused 24 hours');
    v_cooldown := GREATEST(COALESCE(v_cooldown, v_now), v_now + interval '24 hours');
  END IF;

  UPDATE broadcast_contacts
  SET delivery_status = p_status, status_updated_at = v_now, status_updated_by = auth.uid()
  WHERE id = p_contact_id;

  UPDATE broadcast_send_state
  SET health_score = v_score, consecutive_failures = v_streak, cooldown_until = v_cooldown,
      last_negative_at = v_last_negative, last_health_event = 'status_' || p_status, updated_at = v_now
  WHERE id = 1;

  RETURN QUERY SELECT p_status, v_score, public.broadcast_health_tier(v_score), v_cooldown, v_streak;
END;
$$;

REVOKE ALL ON FUNCTION public.report_broadcast_contact_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_broadcast_contact_status(uuid, text) TO authenticated;

-- Operator saw a WhatsApp warning / temporary restriction on the account:
-- drop straight to critical and stop sending for 24 hours.
CREATE OR REPLACE FUNCTION public.report_broadcast_account_warning()
RETURNS TABLE (
  health_score numeric,
  health_tier text,
  cooldown_until timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile record;
  v_state record;
  v_now timestamptz := now();
  v_score numeric;
  v_cooldown timestamptz;
BEGIN
  SELECT user_role, is_active, full_name, email INTO v_profile FROM profiles WHERE id = auth.uid();
  IF NOT FOUND OR v_profile.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'You are not allowed to report broadcast outcomes';
  END IF;

  IF v_profile.user_role <> 'ADMIN' AND NOT EXISTS (
    SELECT 1 FROM role_permissions
    WHERE role = v_profile.user_role
      AND resource = 'action:broadcast_contacts:send_message'
      AND action = 'action'
      AND is_allowed = true
  ) THEN
    RAISE EXCEPTION 'You are not allowed to report broadcast outcomes';
  END IF;

  INSERT INTO broadcast_send_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  SELECT * INTO v_state FROM broadcast_send_state WHERE id = 1 FOR UPDATE;

  v_score := LEAST(COALESCE(v_state.health_score, 60), 15);
  v_cooldown := GREATEST(COALESCE(v_state.cooldown_until, v_now), v_now + interval '24 hours');

  INSERT INTO broadcast_health_events (event_type, score_before, score_after, actor, actor_name, note)
  VALUES ('account_warning', COALESCE(v_state.health_score, 60), v_score, auth.uid(),
          COALESCE(NULLIF(TRIM(v_profile.full_name), ''), v_profile.email, 'Operator'),
          'WhatsApp warning reported, sending paused 24 hours');

  UPDATE broadcast_send_state
  SET health_score = v_score, consecutive_failures = 0, cooldown_until = v_cooldown,
      last_negative_at = v_now, last_health_event = 'account_warning', updated_at = v_now
  WHERE id = 1;

  RETURN QUERY SELECT v_score, public.broadcast_health_tier(v_score), v_cooldown;
END;
$$;

REVOKE ALL ON FUNCTION public.report_broadcast_account_warning() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_broadcast_account_warning() TO authenticated;

-- ---------------------------------------------------------------------------
-- Read-only status for the UI
-- ---------------------------------------------------------------------------

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
  intra_delay_max_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings record;
  v_state record;
  v_history record;
  v_score numeric;
  v_warmup_started timestamptz;
  v_now timestamptz := now();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active IS TRUE) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT * INTO v_settings FROM broadcast_settings WHERE id = 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Broadcast send settings have not been configured'; END IF;
  SELECT * INTO v_state FROM broadcast_send_state WHERE id = 1;

  v_score := COALESCE(v_state.health_score, 60);
  v_warmup_started := v_state.warmup_started_at;
  SELECT * INTO v_history FROM broadcast_history_signals(v_now);

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
    p.intra_delay_max_seconds
  FROM broadcast_throttle_params(
    v_settings.adaptive_enabled, v_score, v_warmup_started, v_now,
    v_settings.wave_min, v_settings.wave_max,
    v_settings.cooldown_min_minutes, v_settings.cooldown_max_minutes,
    v_settings.daily_wave_target,
    v_history.recent_neg_rate, v_history.history_wave_cap
  ) p;
END;
$$;

REVOKE ALL ON FUNCTION public.get_broadcast_throttle_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_broadcast_throttle_status() TO authenticated;
