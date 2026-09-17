create table if not exists public.scene_presentations (
  scene_id uuid primary key references public.scenes(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  asset_path text not null,
  title text not null default '',
  visible boolean not null default true,
  updated_at timestamptz not null default now()
);
create index if not exists scene_presentations_campaign_idx on public.scene_presentations(campaign_id);
alter table public.scene_presentations enable row level security;
create policy "campaign members can read scene presentations" on public.scene_presentations for select to authenticated using (exists (select 1 from public.campaign_members m where m.campaign_id = scene_presentations.campaign_id and m.user_id = auth.uid()));
create policy "campaign gms can write scene presentations" on public.scene_presentations for all to authenticated using (exists (select 1 from public.campaign_members m where m.campaign_id = scene_presentations.campaign_id and m.user_id = auth.uid() and m.role = 'gm')) with check (exists (select 1 from public.campaign_members m where m.campaign_id = scene_presentations.campaign_id and m.user_id = auth.uid() and m.role = 'gm'));
