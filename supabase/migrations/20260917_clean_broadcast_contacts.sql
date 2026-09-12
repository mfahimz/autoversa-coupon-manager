-- Clean all broadcast contacts
TRUNCATE TABLE public.broadcast_contacts;

-- Reset broadcast send state to clean initial state
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
