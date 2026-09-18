-- Keep one read policy per table and scope auth.uid() to one evaluation.
-- The API remains the authorization boundary for the game tables.

drop policy if exists "campaign members can read overlay layouts" on public.scene_overlay_layouts;
drop policy if exists "campaign gms can write overlay layouts" on public.scene_overlay_layouts;

create policy "campaign members can read overlay layouts"
  on public.scene_overlay_layouts
  for select to authenticated
  using (
    exists (
      select 1
      from public.campaign_members m
      where m.campaign_id = scene_overlay_layouts.campaign_id
        and m.user_id = (select auth.uid())
    )
  );

create policy "campaign gms can insert overlay layouts"
  on public.scene_overlay_layouts
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.campaign_members m
      where m.campaign_id = scene_overlay_layouts.campaign_id
        and m.user_id = (select auth.uid())
        and m.role = 'gm'
    )
  );

create policy "campaign gms can update overlay layouts"
  on public.scene_overlay_layouts
  for update to authenticated
  using (
    exists (
      select 1
      from public.campaign_members m
      where m.campaign_id = scene_overlay_layouts.campaign_id
        and m.user_id = (select auth.uid())
        and m.role = 'gm'
    )
  )
  with check (
    exists (
      select 1
      from public.campaign_members m
      where m.campaign_id = scene_overlay_layouts.campaign_id
        and m.user_id = (select auth.uid())
        and m.role = 'gm'
    )
  );

create policy "campaign gms can delete overlay layouts"
  on public.scene_overlay_layouts
  for delete to authenticated
  using (
    exists (
      select 1
      from public.campaign_members m
      where m.campaign_id = scene_overlay_layouts.campaign_id
        and m.user_id = (select auth.uid())
        and m.role = 'gm'
    )
  );

drop policy if exists "campaign members can read scene presentations" on public.scene_presentations;
drop policy if exists "campaign gms can write scene presentations" on public.scene_presentations;

create policy "campaign members can read scene presentations"
  on public.scene_presentations
  for select to authenticated
  using (
    exists (
      select 1
      from public.campaign_members m
      where m.campaign_id = scene_presentations.campaign_id
        and m.user_id = (select auth.uid())
    )
  );

create policy "campaign gms can insert scene presentations"
  on public.scene_presentations
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.campaign_members m
      where m.campaign_id = scene_presentations.campaign_id
        and m.user_id = (select auth.uid())
        and m.role = 'gm'
    )
  );

create policy "campaign gms can update scene presentations"
  on public.scene_presentations
  for update to authenticated
  using (
    exists (
      select 1
      from public.campaign_members m
      where m.campaign_id = scene_presentations.campaign_id
        and m.user_id = (select auth.uid())
        and m.role = 'gm'
    )
  )
  with check (
    exists (
      select 1
      from public.campaign_members m
      where m.campaign_id = scene_presentations.campaign_id
        and m.user_id = (select auth.uid())
        and m.role = 'gm'
    )
  );

create policy "campaign gms can delete scene presentations"
  on public.scene_presentations
  for delete to authenticated
  using (
    exists (
      select 1
      from public.campaign_members m
      where m.campaign_id = scene_presentations.campaign_id
        and m.user_id = (select auth.uid())
        and m.role = 'gm'
    )
  );
