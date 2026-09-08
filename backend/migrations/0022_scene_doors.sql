-- A door is a wall segment with a state. Existing walls remain ordinary,
-- permanently closed walls.
alter table public.scene_walls
  add column if not exists kind text not null default 'wall'
  check (kind in ('wall', 'door')),
  add column if not exists is_open boolean not null default false;
