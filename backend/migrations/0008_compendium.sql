-- Conteúdo fechado deve ser cadastrado apenas como referência privada pelo narrador.
create table if not exists public.compendium_sources (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.campaigns(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9-]{2,64}$'), title text not null check (char_length(title) between 1 and 120),
  kind text not null check (kind in ('srd', 'private', 'homebrew')), version text not null default '',
  attribution text not null default '', license_url text not null default '', is_read_only boolean not null default false,
  created_at timestamptz not null default now(), unique (campaign_id, slug)
);
create table if not exists public.compendium_entries (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.campaigns(id) on delete cascade,
  source_id uuid not null references public.compendium_sources(id) on delete cascade,
  entry_type text not null check (entry_type in ('species', 'background', 'class', 'subclass', 'feat', 'spell', 'item', 'feature', 'other')),
  name text not null check (char_length(name) between 1 and 120), summary text not null default '' check (char_length(summary) <= 2000),
  rules jsonb not null default '{}'::jsonb, is_published boolean not null default true,
  created_by uuid not null references public.profiles(id), updated_at timestamptz not null default now(),
  unique (source_id, entry_type, name)
);
create index if not exists compendium_entries_campaign_type_idx on public.compendium_entries(campaign_id, entry_type, is_published, name);
alter table public.compendium_sources enable row level security;
alter table public.compendium_entries enable row level security;
