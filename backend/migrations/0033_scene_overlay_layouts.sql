create table if not exists public.scene_overlay_layouts (
  scene_id uuid primary key references public.scenes(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  layout jsonb not null check (jsonb_typeof(layout) = 'object'),
  updated_at timestamptz not null default now()
);
create index if not exists scene_overlay_layouts_campaign_idx on public.scene_overlay_layouts(campaign_id);
alter table public.scene_overlay_layouts enable row level security;
create policy "campaign members can read overlay layouts" on public.scene_overlay_layouts
  for select to authenticated using (exists (select 1 from public.campaign_members m where m.campaign_id = scene_overlay_layouts.campaign_id and m.user_id = (select auth.uid())));
create policy "campaign gms can write overlay layouts" on public.scene_overlay_layouts
  for all to authenticated using (exists (select 1 from public.campaign_members m where m.campaign_id = scene_overlay_layouts.campaign_id and m.user_id = (select auth.uid()) and m.role = 'gm'))
  with check (exists (select 1 from public.campaign_members m where m.campaign_id = scene_overlay_layouts.campaign_id and m.user_id = (select auth.uid()) and m.role = 'gm'));
