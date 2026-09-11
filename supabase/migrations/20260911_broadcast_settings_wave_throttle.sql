ALTER TABLE broadcast_settings
  ADD COLUMN wave_min integer NOT NULL DEFAULT 5,
  ADD COLUMN wave_max integer NOT NULL DEFAULT 8,
  ADD COLUMN cooldown_min_minutes integer NOT NULL DEFAULT 5,
  ADD COLUMN cooldown_max_minutes integer NOT NULL DEFAULT 15;
