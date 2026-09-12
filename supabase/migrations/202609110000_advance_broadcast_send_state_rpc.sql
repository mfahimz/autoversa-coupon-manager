DROP FUNCTION IF EXISTS public.advance_broadcast_send_state();

CREATE FUNCTION public.advance_broadcast_send_state()
RETURNS TABLE (
  current_wave_count integer,
  wave_target integer,
  cooldown_until timestamptz
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
BEGIN
  -- Lock the single state row for the duration of this transaction to serialize concurrent callers
  SELECT * INTO v_state FROM broadcast_send_state WHERE id = 1 FOR UPDATE;
  SELECT wave_min, wave_max, cooldown_min_minutes, cooldown_max_minutes INTO v_settings FROM broadcast_settings WHERE id = 1;

  -- Initialize wave_target on first-ever send (0 or null means uninitialized)
  IF v_state.wave_target IS NULL OR v_state.wave_target = 0 THEN
    v_state.wave_target := v_settings.wave_min + floor(random() * (v_settings.wave_max - v_settings.wave_min + 1))::integer;
  END IF;

  v_new_count := v_state.current_wave_count + 1;

  IF v_new_count >= v_state.wave_target THEN
    -- Wave complete: reset count, roll new target and cooldown
    v_new_count := 0;
    v_new_target := v_settings.wave_min + floor(random() * (v_settings.wave_max - v_settings.wave_min + 1))::integer;
    v_new_cooldown := now() + (v_settings.cooldown_min_minutes + floor(random() * (v_settings.cooldown_max_minutes - v_settings.cooldown_min_minutes + 1))) * interval '1 minute';
  ELSE
    v_new_target := v_state.wave_target;
    v_new_cooldown := v_state.cooldown_until;
  END IF;

  UPDATE broadcast_send_state
  SET current_wave_count = v_new_count,
      wave_target = v_new_target,
      cooldown_until = v_new_cooldown,
      last_sent_at = now(),
      updated_at = now()
  WHERE id = 1;

  RETURN QUERY SELECT v_new_count, v_new_target, v_new_cooldown;
END;
$$;

GRANT EXECUTE ON FUNCTION public.advance_broadcast_send_state() TO authenticated;
