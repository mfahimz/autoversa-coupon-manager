-- Same issue as 20260821_fix_table_grants.sql: broadcast_contacts, broadcast_settings,
-- and broadcast_send_state were created without Supabase's standard schema-level grants,
-- causing "permission denied for table" (42501) on all REST/PostgREST access despite
-- RLS policies being correct.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_contacts TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_settings TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_send_state TO anon, authenticated, service_role;
