-- Record a message and advance its wave in one transaction. This prevents a
-- contact from being marked sent when the wave is paused or at its daily limit.
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
  v_sent_at timestamptz := now();
BEGIN
  SELECT user_role, is_active INTO v_profile FROM profiles WHERE id = auth.uid();
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
  v_new_count := v_state.current_wave_count + 1;

  IF v_new_count >= v_state.wave_target THEN
    v_new_count := 0;
    v_new_target := v_settings.wave_min + floor(random() * (v_settings.wave_max - v_settings.wave_min + 1))::integer;
    v_new_cooldown := v_sent_at + (v_settings.cooldown_min_minutes + floor(random() * (v_settings.cooldown_max_minutes - v_settings.cooldown_min_minutes + 1))) * interval '1 minute';
    v_waves_today := v_waves_today + 1;
  ELSE
    v_new_target := v_state.wave_target;
    v_new_cooldown := v_state.cooldown_until;
  END IF;

  UPDATE broadcast_contacts SET sent_at = v_sent_at, sent_by = auth.uid() WHERE id = p_contact_id;
  UPDATE broadcast_send_state
  SET current_wave_count = v_new_count, wave_target = v_new_target, cooldown_until = v_new_cooldown,
      last_sent_at = v_sent_at, updated_at = v_sent_at, waves_completed_today = v_waves_today,
      daily_period_started_at = v_period_start, daily_override_extra = v_override
  WHERE id = 1;

  RETURN QUERY SELECT v_sent_at, v_new_count, v_new_target, v_new_cooldown, v_waves_today, v_period_start, v_override;
END;
$$;

REVOKE ALL ON FUNCTION public.record_broadcast_contact_sent(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_broadcast_contact_sent(uuid) TO authenticated;

-- The old state-only function allowed callers to advance a wave without also
-- recording a contact. Keep it installed for rollback compatibility, but do
-- not expose it to application users.
REVOKE ALL ON FUNCTION public.advance_broadcast_send_state() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.advance_broadcast_send_state() FROM authenticated;
