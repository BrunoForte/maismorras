-- Stores the reusable initiative modifier separately from each combat roll.
alter table public.scene_tokens
  add column if not exists initiative_bonus integer not null default 0;

-- Seed tokens already placed on a scene from their linked actor sheet.
update public.scene_tokens token
set initiative_bonus = case actor.kind
  when 'character' then coalesce(floor(((actor.sheet #>> '{abilityScores,dexterity}')::numeric - 10) / 2)::integer, 0)
  else coalesce((actor.sheet ->> 'initiative')::integer, 0)
end
from public.actors actor
where token.actor_id = actor.id;
