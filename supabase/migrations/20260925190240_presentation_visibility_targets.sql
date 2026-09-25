alter table public.scene_presentations
  add column if not exists visible_user_ids uuid[] not null default '{}',
  add column if not exists audience_restricted boolean not null default false,
  add column if not exists overlay_visible boolean not null default false;

drop policy if exists "campaign members can read scene presentations"
  on public.scene_presentations;
drop policy if exists "campaign members read permitted presentations"
  on public.scene_presentations;
create policy "campaign members read presentations addressed to them"
  on public.scene_presentations for select to authenticated
  using (exists (
    select 1 from public.campaign_members m
    where m.campaign_id = scene_presentations.campaign_id
      and m.user_id = (select auth.uid())
      and (
        m.role = 'gm'::public.campaign_role
        or (
          scene_presentations.visible
          and (
            not scene_presentations.audience_restricted
            or (select auth.uid()) = any(scene_presentations.visible_user_ids)
          )
        )
      )
  ));
