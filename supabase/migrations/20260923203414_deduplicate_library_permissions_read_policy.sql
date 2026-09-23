-- The GM ALL policy already covers SELECT; avoid a duplicate permissive policy.
drop policy if exists "campaign gms read item permissions"
  on public.library_item_permissions;
