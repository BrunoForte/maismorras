-- Server-side, fixed-window image quotas shared by all Cloud Run instances.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;
create table if not exists private.image_generation_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null check (operation in ('portrait', 'map')),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, operation)
);
revoke all on table private.image_generation_limits from public, anon, authenticated, service_role;

-- Keep the existing note visibility rules, but avoid the broad FOR ALL policy
-- overlapping SELECT and reevaluating auth.uid() once per row.
drop policy if exists notes_member_select on public.notes;
drop policy if exists notes_author_write on public.notes;

create policy notes_member_select on public.notes
for select to authenticated
using (
  exists (
    select 1 from public.campaign_members m
    where m.campaign_id = notes.campaign_id and m.user_id = (select auth.uid())
  )
  and (
    notes.visibility = 'players'
    or notes.author_id = (select auth.uid())
    or exists (
      select 1 from public.campaign_members gm
      where gm.campaign_id = notes.campaign_id
        and gm.user_id = (select auth.uid())
        and gm.role = 'gm'
    )
  )
);

create policy notes_author_insert on public.notes
for insert to authenticated
with check (
  author_id = (select auth.uid())
  or exists (
    select 1 from public.campaign_members gm
    where gm.campaign_id = notes.campaign_id
      and gm.user_id = (select auth.uid())
      and gm.role = 'gm'
  )
);

create policy notes_author_update on public.notes
for update to authenticated
using (
  author_id = (select auth.uid())
  or exists (
    select 1 from public.campaign_members gm
    where gm.campaign_id = notes.campaign_id
      and gm.user_id = (select auth.uid())
      and gm.role = 'gm'
  )
)
with check (
  author_id = (select auth.uid())
  or exists (
    select 1 from public.campaign_members gm
    where gm.campaign_id = notes.campaign_id
      and gm.user_id = (select auth.uid())
      and gm.role = 'gm'
  )
);

create policy notes_author_delete on public.notes
for delete to authenticated
using (
  author_id = (select auth.uid())
  or exists (
    select 1 from public.campaign_members gm
    where gm.campaign_id = notes.campaign_id
      and gm.user_id = (select auth.uid())
      and gm.role = 'gm'
  )
);
