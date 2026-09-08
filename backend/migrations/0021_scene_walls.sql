-- Walls are kept server-side: they affect player vision but must never reveal
-- the dungeon layout to a browser that has not discovered it yet.
create table if not exists public.scene_walls (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.scenes(id) on delete cascade,
  start_x integer not null,
  start_y integer not null,
  end_x integer not null,
  end_y integer not null,
  created_at timestamptz not null default now(),
  check (start_x <> end_x or start_y <> end_y)
);

create index if not exists scene_walls_scene_idx
  on public.scene_walls(scene_id, created_at);
