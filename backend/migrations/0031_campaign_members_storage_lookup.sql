-- Storage policies validate campaign membership through campaign_members.
-- Allow each authenticated user to read only their own membership row so
-- those checks can succeed without exposing other players' memberships.
drop policy if exists "members can read own campaign memberships" on public.campaign_members;
create policy "members can read own campaign memberships"
on public.campaign_members
for select
to authenticated
using (user_id = (select auth.uid()));
