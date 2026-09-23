alter table public.scenes
  add column if not exists map_width_cells integer not null default 30,
  add column if not exists map_height_cells integer not null default 20;

alter table public.scenes
  add constraint scenes_map_width_cells_check check (map_width_cells between 5 and 100),
  add constraint scenes_map_height_cells_check check (map_height_cells between 5 and 100);
