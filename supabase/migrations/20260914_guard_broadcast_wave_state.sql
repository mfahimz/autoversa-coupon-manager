-- Only the security-definer send function may mark a broadcast contact as sent.
-- This prevents an old browser tab from bypassing the shared wave/cooldown state.
CREATE OR REPLACE FUNCTION public.guard_broadcast_contact_sent_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_send_function_owner name;
BEGIN
  IF NEW.sent_at IS DISTINCT FROM OLD.sent_at THEN
    SELECT r.rolname INTO v_send_function_owner
    FROM pg_proc p
    JOIN pg_roles r ON r.oid = p.proowner
    WHERE p.oid = 'public.record_broadcast_contact_sent(uuid)'::regprocedure;

    IF current_user <> v_send_function_owner THEN
      RAISE EXCEPTION 'Broadcast messages must be recorded through the wave send workflow';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_broadcast_contact_sent_update ON public.broadcast_contacts;
CREATE TRIGGER guard_broadcast_contact_sent_update
  BEFORE UPDATE OF sent_at ON public.broadcast_contacts
  FOR EACH ROW EXECUTE FUNCTION public.guard_broadcast_contact_sent_update();

-- Repair any legacy/stale-tab state where a completed wave was left at its
-- target without starting the next shared cooldown.
DO $$
DECLARE
  v_state record;
  v_settings record;
  v_next_target integer;
  v_cooldown_until timestamptz;
BEGIN
  SELECT * INTO v_state FROM public.broadcast_send_state WHERE id = 1 FOR UPDATE;
  SELECT * INTO v_settings FROM public.broadcast_settings WHERE id = 1;

  IF FOUND AND v_state.wave_target > 0 AND v_state.current_wave_count >= v_state.wave_target THEN
    v_next_target := v_settings.wave_min + floor(random() * (v_settings.wave_max - v_settings.wave_min + 1))::integer;
    v_cooldown_until := COALESCE(v_state.last_sent_at, now())
      + (v_settings.cooldown_min_minutes + floor(random() * (v_settings.cooldown_max_minutes - v_settings.cooldown_min_minutes + 1))) * interval '1 minute';

    UPDATE public.broadcast_send_state
    SET current_wave_count = 0,
        wave_target = v_next_target,
        cooldown_until = v_cooldown_until,
        waves_completed_today = waves_completed_today + 1,
        current_wave_started_at = NULL,
        updated_at = now()
    WHERE id = 1;
  END IF;
END;
$$;
