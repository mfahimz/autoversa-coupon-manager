ALTER TABLE broadcast_settings
  ADD COLUMN daily_wave_target integer NOT NULL DEFAULT 20;

ALTER TABLE broadcast_send_state
  ADD COLUMN waves_completed_today integer NOT NULL DEFAULT 0,
  ADD COLUMN daily_period_started_at timestamptz,
  ADD COLUMN daily_override_extra integer NOT NULL DEFAULT 0;

DROP FUNCTION IF EXISTS public.advance_broadcast_send_state();

CREATE OR REPLACE FUNCTION public.advance_broadcast_send_state()
RETURNS TABLE (
  current_wave_count integer,
  wave_target integer,
  cooldown_until timestamptz,
  waves_completed_today integer,
  daily_period_started_at timestamptz,
  daily_override_extra integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_settings RECORD;
  v_state RECORD;
  v_new_count integer;
  v_new_target integer;
  v_new_cooldown timestamptz;
  v_waves_today integer;
  v_period_start timestamptz;
  v_override integer;
BEGIN
  -- Lock the single state row for the duration of this transaction to serialize concurrent callers
  SELECT * INTO v_state FROM broadcast_send_state WHERE id = 1 FOR UPDATE;
  SELECT wave_min, wave_max, cooldown_min_minutes, cooldown_max_minutes, daily_wave_target
    INTO v_settings FROM broadcast_settings WHERE id = 1;

  -- Initialize wave_target on first-ever send (0 or null means uninitialized)
  IF v_state.wave_target IS NULL OR v_state.wave_target = 0 THEN
    v_state.wave_target := v_settings.wave_min + floor(random() * (v_settings.wave_max - v_settings.wave_min + 1))::integer;
  END IF;

  v_period_start := v_state.daily_period_started_at;
  v_waves_today := v_state.waves_completed_today;
  v_override := v_state.daily_override_extra;

  -- Rolling 24h reset of the daily wave counter (and any admin override granted for the prior period)
  IF v_period_start IS NULL OR now() >= v_period_start + interval '24 hours' THEN
    v_period_start := now();
    v_waves_today := 0;
    v_override := 0;
  END IF;

  v_new_count := v_state.current_wave_count + 1;

  IF v_new_count >= v_state.wave_target THEN
    -- Wave complete: reset count, roll new target and cooldown, count the completed wave toward today's total
    v_new_count := 0;
    v_new_target := v_settings.wave_min + floor(random() * (v_settings.wave_max - v_settings.wave_min + 1))::integer;
    v_new_cooldown := now() + (v_settings.cooldown_min_minutes + floor(random() * (v_settings.cooldown_max_minutes - v_settings.cooldown_min_minutes + 1))) * interval '1 minute';
    v_waves_today := v_waves_today + 1;
  ELSE
    v_new_target := v_state.wave_target;
    v_new_cooldown := v_state.cooldown_until;
  END IF;

  UPDATE broadcast_send_state
  SET current_wave_count = v_new_count,
      wave_target = v_new_target,
      cooldown_until = v_new_cooldown,
      last_sent_at = now(),
      updated_at = now(),
      waves_completed_today = v_waves_today,
      daily_period_started_at = v_period_start,
      daily_override_extra = v_override
  WHERE id = 1;

  RETURN QUERY SELECT v_new_count, v_new_target, v_new_cooldown, v_waves_today, v_period_start, v_override;
END;
$$;

GRANT EXECUTE ON FUNCTION public.advance_broadcast_send_state() TO authenticated;
