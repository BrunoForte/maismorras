alter table public.scenes
  add column if not exists allow_player_movement boolean not null default false;
