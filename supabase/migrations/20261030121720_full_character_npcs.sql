-- Full NPC sheets use the existing actor identity so scene tokens and the
-- character-sheet API can address them without linking them to a participant.
-- Existing actors remain non-NPC sheets by default.
alter table public.actors
  add column if not exists full_npc boolean not null default false;

-- The original actors_check allowed only ownerless simplified NPC actors and
-- participant-owned character actors. Replace it with an explicit invariant:
-- full NPCs are ownerless character sheets; every other character remains
-- participant-owned; simplified NPCs stay ownerless and separate.
alter table public.actors
  drop constraint if exists actors_check;

alter table public.actors
  add constraint actors_owner_kind_full_npc_check
  check (
    (kind = 'character' and full_npc and owner_id is null)
    or (kind = 'character' and not full_npc and owner_id is not null)
    or (kind = 'npc' and not full_npc and owner_id is null)
  );

create index if not exists actors_full_npc_campaign_created_at_idx
  on public.actors(campaign_id, created_at, id)
  where full_npc;

comment on column public.actors.full_npc is
  'True for narrator-managed full character sheets without a campaign participant owner.';

-- Keep the original one-sheet-per-participant partial unique index unchanged.
-- PostgreSQL permits multiple NULL owner_id values, so full NPCs are unlimited.
