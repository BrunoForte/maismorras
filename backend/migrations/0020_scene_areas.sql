create table if not exists public.scene_areas (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.scenes(id) on delete cascade,
  shape text not null check (shape in ('line', 'circle', 'cone')),
  start_x integer not null,
  start_y integer not null,
  end_x integer not null,
  end_y integer not null,
  color integer not null default 14715055 check (color between 0 and 16777215),
  label text not null default 'Área de efeito' check (char_length(label) between 1 and 80),
  visible_to_players boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists scene_areas_scene_idx on public.scene_areas(scene_id, created_at);
