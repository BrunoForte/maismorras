-- Manual narrator overrides take precedence over automatic token vision.
create table if not exists public.scene_fog_overrides (
  scene_id uuid not null references public.scenes(id) on delete cascade,
  cell_x integer not null,
  cell_y integer not null,
  mode text not null check (mode in ('reveal', 'hide')),
  updated_at timestamptz not null default now(),
  primary key (scene_id, cell_x, cell_y)
);
