drop policy if exists campaigns_member_select on public.campaigns;
create policy campaigns_member_select on public.campaigns for select to authenticated using (owner_id = auth.uid() or exists (select 1 from public.campaign_members m where m.campaign_id = campaigns.id and m.user_id = auth.uid()));
drop policy if exists campaigns_owner_insert on public.campaigns;
create policy campaigns_owner_insert on public.campaigns for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists campaigns_owner_update on public.campaigns;
create policy campaigns_owner_update on public.campaigns for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists campaigns_owner_delete on public.campaigns;
create policy campaigns_owner_delete on public.campaigns for delete to authenticated using (owner_id = auth.uid());
