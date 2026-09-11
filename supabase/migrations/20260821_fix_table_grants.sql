-- Fix: coupon_follow_ups and advisor_commission_payouts were created without
-- Supabase's standard schema-level grants, causing "permission denied for table"
-- (42501) on all REST/PostgREST access despite RLS policies being correct.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupon_follow_ups TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.advisor_commission_payouts TO anon, authenticated, service_role;
