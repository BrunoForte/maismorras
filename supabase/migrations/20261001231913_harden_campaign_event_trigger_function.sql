-- Keep campaign event publication an internal trigger-only capability.
-- The empty search_path prevents object shadowing by user-controlled schemas.
create or replace function public.notify_campaign_game_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_author text;
begin
  if new.event_type not in ('chat.message', 'dice.roll', 'combat.log', 'system.info') then
    return new;
  end if;

  select pg_catalog.left(coalesce(p.display_name, 'Mesa'), 80)
    into event_author
    from (select 1) as seed
    left join public.profiles as p on p.id = new.actor_id;

  perform pg_catalog.pg_notify(
    'maismorras_realtime_v1',
    pg_catalog.jsonb_build_object(
      'protocolVersion', 1,
      'eventId', new.id::text,
      'originInstanceId', 'postgres',
      'roomType', 'campaign',
      'campaignId', new.campaign_id::text,
      'payload', pg_catalog.jsonb_build_object(
        'type', 'campaign.event',
        'event', pg_catalog.jsonb_build_object(
          'id', new.id,
          'author', event_author,
          'type', new.event_type,
          -- Bound serialized JSON text, since control characters can expand in NOTIFY.
          'payload', case
            when pg_catalog.octet_length(new.payload::text) <= 3500 then new.payload
            else null
          end,
          'createdAt', new.created_at
        )
      )
    )::text
  );
  return new;
end;
$$;

revoke all privileges on function public.notify_campaign_game_event()
  from public, anon, authenticated, service_role;

drop trigger if exists game_events_campaign_realtime on public.game_events;
create trigger game_events_campaign_realtime
after insert on public.game_events
for each row execute function public.notify_campaign_game_event();
