-- Revoke MANAGER access to the Broadcast Outreach Algorithm Performance page.
-- ADMIN keeps implicit access; ASSISTANT_GENERAL_MANAGER keeps its grant.
-- Admins can re-grant per role at any time from the Users & Permissions screen.

DELETE FROM public.role_permissions
WHERE role = 'MANAGER'
  AND resource = 'page:broadcast-outreach-performance'
  AND action = 'view';
