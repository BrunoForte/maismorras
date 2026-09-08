alter table public.scene_tokens
  add column if not exists light_range integer not null default 0
  check (light_range between 0 and 30);

alter table public.scenes
  add column if not exists allow_player_door_interaction boolean not null default false;
