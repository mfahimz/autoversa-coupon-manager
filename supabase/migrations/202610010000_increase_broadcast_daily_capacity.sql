-- Modest capacity increase. Adaptive health and history limits still apply.
UPDATE public.broadcast_settings
SET daily_wave_target = 10,
    updated_at = now()
WHERE id = 1
  AND daily_wave_target < 10;
