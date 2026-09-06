-- Execute após 0001 e 0002 no SQL Editor do Supabase.
create table if not exists public.scenes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  background_url text,
  grid_size integer not null default 70 check (grid_size between 20 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scene_tokens (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.scenes(id) on delete cascade,
  actor_id uuid references public.actors(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  image_url text,
  color integer not null default 3381504 check (color between 0 and 16777215),
  position_x integer not null default 70,
  position_y integer not null default 70,
  size integer not null default 1 check (size between 1 and 6),
  hp_current integer not null default 10 check (hp_current >= 0),
  hp_max integer not null default 10 check (hp_max > 0),
  armor_class integer not null default 10 check (armor_class between 0 and 99),
  initiative integer not null default 0,
  statuses jsonb not null default '[]'::jsonb check (jsonb_typeof(statuses) = 'array'),
  is_hidden boolean not null default false,
  updated_at timestamptz not null default now(),
  check (hp_current <= hp_max)
);

create index if not exists scenes_campaign_id on public.scenes(campaign_id);
create index if not exists scene_tokens_scene_id on public.scene_tokens(scene_id);
