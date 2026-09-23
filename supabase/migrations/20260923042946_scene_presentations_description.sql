alter table public.scene_presentations
  add column if not exists description text not null default '';
