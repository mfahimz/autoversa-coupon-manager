-- Grant execute permissions for broadcast throttle status to service_role and anon
GRANT EXECUTE ON FUNCTION public.get_broadcast_throttle_status() TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.record_broadcast_contact_sent(uuid) TO authenticated, service_role;
