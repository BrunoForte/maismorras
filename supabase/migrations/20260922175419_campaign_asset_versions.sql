-- Versioned campaign assets and safe orphan collection metadata.
create table if not exists public.campaign_assets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  path text not null,
  thumbnail_path text,
  kind text not null check (kind in ('image','audio','document','map')),
  version integer not null default 1 check (version > 0),
  sha256 text,
  mime_type text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  orphaned_at timestamptz,
  deleted_at timestamptz,
  unique (campaign_id, path, version)
);
create index if not exists campaign_assets_campaign_idx on public.campaign_assets(campaign_id, deleted_at, created_at desc);
create index if not exists campaign_assets_orphan_idx on public.campaign_assets(orphaned_at) where deleted_at is null;
alter table public.campaign_assets enable row level security;
drop policy if exists campaign_assets_select on public.campaign_assets;
create policy campaign_assets_select on public.campaign_assets for select to authenticated using (exists (select 1 from public.campaign_members m where m.campaign_id = campaign_assets.campaign_id and m.user_id = auth.uid()) or exists (select 1 from public.campaigns c where c.id = campaign_assets.campaign_id and c.owner_id = auth.uid()));
drop policy if exists campaign_assets_gm_write on public.campaign_assets;
create policy campaign_assets_gm_write on public.campaign_assets for all to authenticated using (exists (select 1 from public.campaign_members m where m.campaign_id = campaign_assets.campaign_id and m.user_id = auth.uid() and m.role = 'gm') or exists (select 1 from public.campaigns c where c.id = campaign_assets.campaign_id and c.owner_id = auth.uid())) with check (exists (select 1 from public.campaign_members m where m.campaign_id = campaign_assets.campaign_id and m.user_id = auth.uid() and m.role = 'gm') or exists (select 1 from public.campaigns c where c.id = campaign_assets.campaign_id and c.owner_id = auth.uid()));
grant select on public.campaign_assets to authenticated;


