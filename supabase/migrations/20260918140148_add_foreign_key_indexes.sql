-- Cover foreign keys used by campaign, scene and event lookups.
-- These indexes are additive and safe for the existing production data.
create index if not exists actors_owner_id_idx
  on public.actors (owner_id);

create index if not exists campaign_invites_created_by_idx
  on public.campaign_invites (created_by);

create index if not exists campaign_invites_accepted_by_idx
  on public.campaign_invites (accepted_by)
  where accepted_by is not null;

create index if not exists campaign_members_user_id_idx
  on public.campaign_members (user_id);

create index if not exists campaigns_owner_id_idx
  on public.campaigns (owner_id);

create index if not exists compendium_entries_created_by_idx
  on public.compendium_entries (created_by);

create index if not exists game_events_actor_id_idx
  on public.game_events (actor_id)
  where actor_id is not null;

create index if not exists notes_author_id_idx
  on public.notes (author_id);

create index if not exists notes_campaign_id_idx
  on public.notes (campaign_id);

create index if not exists scene_token_effects_scene_id_idx
  on public.scene_token_effects (scene_id);

create index if not exists scene_token_turn_movement_token_id_idx
  on public.scene_token_turn_movement (token_id);

create index if not exists scene_tokens_actor_id_idx
  on public.scene_tokens (actor_id)
  where actor_id is not null;

create index if not exists scene_tokens_owner_id_idx
  on public.scene_tokens (owner_id)
  where owner_id is not null;

create index if not exists scenes_active_token_id_idx
  on public.scenes (active_token_id)
  where active_token_id is not null;
