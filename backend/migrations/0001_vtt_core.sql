-- Execute no SQL Editor do Supabase. A autenticação é mantida em auth.users.
create extension if not exists pgcrypto;

create type campaign_role as enum ('gm', 'player');
create type actor_kind as enum ('character', 'npc');
create type note_visibility as enum ('gm', 'players');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Aventureiro',
  created_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  owner_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_members (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role campaign_role not null default 'player',
  joined_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create table if not exists public.actors (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  kind actor_kind not null,
  name text not null check (char_length(name) between 1 and 120),
  sheet jsonb not null default '{}'::jsonb,
  token jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check ((kind = 'npc' and owner_id is null) or (kind = 'character' and owner_id is not null))
);

-- Uma ficha de jogador por usuário dentro de cada campanha; NPCs não entram na regra.
create unique index if not exists one_character_per_player_per_campaign
  on public.actors(campaign_id, owner_id) where kind = 'character';

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  title text not null,
  body text not null default '',
  visibility note_visibility not null default 'gm',
  updated_at timestamptz not null default now()
);

create table if not exists public.game_events (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists game_events_campaign_id_id on public.game_events(campaign_id, id);

alter table public.profiles enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
alter table public.actors enable row level security;
alter table public.notes enable row level security;

-- A API Go usa a service role e valida a associação antes de operar.
-- Não exponha a service role no frontend.
