drop policy if exists events_member_select on public.game_events;
create policy events_member_select on public.game_events for select to authenticated using (exists (select 1 from public.campaign_members m where m.campaign_id = game_events.campaign_id and m.user_id = auth.uid()) or exists (select 1 from public.campaigns c where c.id = game_events.campaign_id and c.owner_id = auth.uid()));
drop policy if exists events_member_insert on public.game_events;
create policy events_member_insert on public.game_events for insert to authenticated with check (exists (select 1 from public.campaign_members m where m.campaign_id = game_events.campaign_id and m.user_id = auth.uid()) or exists (select 1 from public.campaigns c where c.id = game_events.campaign_id and c.owner_id = auth.uid()));
