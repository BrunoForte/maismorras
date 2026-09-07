-- Execute no SQL Editor do Supabase após as migrations anteriores.
alter type actor_kind add value if not exists 'monster';
alter table public.scenes
  add column if not exists player_access text not null default 'available' check (player_access in ('hidden','available','active')),
  add column if not exists fog_enabled boolean not null default false,
  add column if not exists vision_mode text not null default 'manual' check (vision_mode in ('manual','shared','token'));
create unique index if not exists one_active_scene_per_campaign on public.scenes(campaign_id) where player_access = 'active';
alter table public.actors add column if not exists template_id uuid references public.actors(id) on delete set null;
create index if not exists actors_campaign_kind_idx on public.actors(campaign_id, kind);
