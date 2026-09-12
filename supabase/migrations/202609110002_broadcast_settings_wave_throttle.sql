ALTER TABLE broadcast_settings
  ADD COLUMN IF NOT EXISTS wave_min integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS wave_max integer NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS cooldown_min_minutes integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS cooldown_max_minutes integer NOT NULL DEFAULT 15;
