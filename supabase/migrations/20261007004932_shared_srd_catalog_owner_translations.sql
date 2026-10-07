-- Canonical D&D SRD catalog, versioned independently from campaign content.
-- Legacy campaign SRD rows remain in place so existing JSON references keep
-- resolving; the API gradually maps those IDs to these shared records.
create table if not exists public.srd_catalog_sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (slug ~ '^[a-z0-9-]{2,64}$'),
  version text not null check (char_length(version) between 1 and 32),
  revision text not null default '',
  title text not null check (char_length(title) between 1 and 120),
  attribution text not null default '',
  license_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slug, version)
);

create table if not exists public.srd_catalog_entries (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.srd_catalog_sources(id) on delete restrict,
  entry_type text not null check (entry_type in ('species', 'background', 'class', 'subclass', 'feat', 'spell', 'item', 'feature', 'other')),
  name text not null check (char_length(name) between 1 and 120),
  summary text not null default '' check (char_length(summary) <= 2000),
  rules jsonb not null default '{}'::jsonb,
  translations jsonb not null default '{}'::jsonb,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, entry_type, name)
);

create index if not exists srd_catalog_entries_type_name_idx
  on public.srd_catalog_entries(source_id, entry_type, name)
  where is_published;

-- Explicitly binds a campaign to a catalog origin/version. The backend is the
-- only writer; future versions do not silently inherit this association.
create table if not exists public.campaign_srd_catalog_sources (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  source_id uuid not null references public.srd_catalog_sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (campaign_id, source_id)
);

-- Transitional identity map: campaign-specific SRD UUIDs remain valid in old
-- character/token JSON, while new compendium responses point to the canonical
-- row. It deliberately stores no copied content or translation.
create table if not exists public.srd_catalog_entry_aliases (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  legacy_entry_id uuid not null references public.compendium_entries(id) on delete cascade,
  catalog_entry_id uuid not null references public.srd_catalog_entries(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (campaign_id, legacy_entry_id)
);

-- Campaign-specific rules such as feat grants stay beside (not inside) the
-- canonical SRD entry and therefore cannot leak between campaigns. Historical
-- campaign translations are retained here as scoped overrides, never copied to
-- the canonical translation document.
create table if not exists public.campaign_srd_entry_overrides (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  catalog_entry_id uuid not null references public.srd_catalog_entries(id) on delete cascade,
  rules jsonb not null default '{}'::jsonb,
  translations jsonb not null default '{}'::jsonb,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key (campaign_id, catalog_entry_id)
);

create index if not exists srd_catalog_entry_aliases_catalog_idx
  on public.srd_catalog_entry_aliases(campaign_id, catalog_entry_id);

alter table public.srd_catalog_sources enable row level security;
alter table public.srd_catalog_entries enable row level security;
alter table public.campaign_srd_catalog_sources enable row level security;
alter table public.srd_catalog_entry_aliases enable row level security;
alter table public.campaign_srd_entry_overrides enable row level security;

-- The application reads/writes these tables only through the authenticated Go
-- API, which applies campaign membership and owner-UUID checks. The Supabase
-- Data API must not provide a direct write path that could forge provenance.
revoke all privileges on table public.srd_catalog_sources from public, anon, authenticated, service_role;
revoke all privileges on table public.srd_catalog_entries from public, anon, authenticated, service_role;
revoke all privileges on table public.campaign_srd_catalog_sources from public, anon, authenticated, service_role;
revoke all privileges on table public.srd_catalog_entry_aliases from public, anon, authenticated, service_role;
revoke all privileges on table public.campaign_srd_entry_overrides from public, anon, authenticated, service_role;

-- No Data API policies are created: RLS is deny-by-default for direct clients.
-- The trusted backend connects with its database role and checks campaign
-- membership for reads and MAISMORRAS_OWNER_USER_ID for shared translation.
