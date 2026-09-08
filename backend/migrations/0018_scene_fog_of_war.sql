-- Shared party vision. A cell is stored only once it has been explored; the
-- current field of view is derived from character-token positions at read time.
alter table public.scene_tokens
  add column if not exists vision_range integer not null default 6
  check (vision_range between 0 and 30);

create table if not exists public.scene_revealed_cells (
  scene_id uuid not null references public.scenes(id) on delete cascade,
  cell_x integer not null,
  cell_y integer not null,
  revealed_at timestamptz not null default now(),
  primary key (scene_id, cell_x, cell_y)
);

create index if not exists scene_revealed_cells_scene_idx
  on public.scene_revealed_cells(scene_id);
