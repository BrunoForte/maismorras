-- Safe reconciliation for deployments that received scene features before all
-- SQL migrations were run. Every operation is idempotent.
alter table public.scenes
  add column if not exists allow_player_movement boolean not null default false,
  add column if not exists allow_player_door_interaction boolean not null default false;

alter table public.scene_tokens
  add column if not exists vision_range integer not null default 6
  check (vision_range between 0 and 30),
  add column if not exists light_range integer not null default 0
  check (light_range between 0 and 30);

-- The browser only uses the API; the database connection used by the Go
-- service is the table owner and keeps operating normally. With no public
-- policies, direct anon/authenticated PostgREST access is denied by default.
alter table if exists public.game_events enable row level security;
alter table if exists public.scenes enable row level security;
alter table if exists public.scene_tokens enable row level security;
alter table if exists public.scene_revealed_cells enable row level security;
alter table if exists public.scene_fog_overrides enable row level security;
alter table if exists public.scene_areas enable row level security;
alter table if exists public.scene_walls enable row level security;
alter table if exists public.scene_token_effects enable row level security;
alter table if exists public.effect_definitions enable row level security;
alter table if exists public.compendium_entries enable row level security;
alter table if exists public.compendium_entry_translations enable row level security;
alter table if exists public.campaign_invites enable row level security;
alter table if exists public.scene_token_turn_movement enable row level security;
