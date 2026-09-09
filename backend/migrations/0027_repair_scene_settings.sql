-- Repair for databases where part of the scene migration sequence was skipped.
-- This is deliberately idempotent: it preserves existing scenes and only fills
-- columns and tables required by the published scene API.
alter table public.scenes
  add column if not exists player_access text not null default 'available',
  add column if not exists fog_enabled boolean not null default false,
  add column if not exists vision_mode text not null default 'manual',
  add column if not exists allow_player_movement boolean not null default false,
  add column if not exists allow_player_door_interaction boolean not null default false,
  add column if not exists enforce_turn_order boolean not null default false;

alter table public.scene_tokens
  add column if not exists vision_range integer not null default 6
    check (vision_range between 0 and 30),
  add column if not exists light_range integer not null default 0
    check (light_range between 0 and 30),
  add column if not exists movement_limit integer not null default 6
    check (movement_limit between 0 and 30);

create table if not exists public.scene_token_turn_movement (
  scene_id uuid not null references public.scenes(id) on delete cascade,
  token_id uuid not null references public.scene_tokens(id) on delete cascade,
  spent_squares numeric(8,2) not null default 0 check (spent_squares >= 0),
  updated_at timestamptz not null default now(),
  primary key (scene_id, token_id)
);

-- Keep the values accepted by the API constrained without duplicating a
-- constraint when this script is run more than once.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'scenes_player_access_check'
      and conrelid = 'public.scenes'::regclass
  ) then
    alter table public.scenes
      add constraint scenes_player_access_check
      check (player_access in ('hidden', 'available', 'active'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'scenes_vision_mode_check'
      and conrelid = 'public.scenes'::regclass
  ) then
    alter table public.scenes
      add constraint scenes_vision_mode_check
      check (vision_mode in ('manual', 'shared', 'token'));
  end if;
end $$;

create unique index if not exists one_active_scene_per_campaign
  on public.scenes(campaign_id)
  where player_access = 'active';
