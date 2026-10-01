-- Emit only after a game_events transaction commits. The PostgreSQL listener
-- in the API turns this outbox notification into a campaign-room WebSocket
-- event; clients never authoritatively publish persisted chat/dice updates.
create or replace function public.notify_campaign_game_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_author text;
begin
  if new.event_type not in ('chat.message', 'dice.roll', 'combat.log', 'system.info') then
    return new;
  end if;

  select left(coalesce(p.display_name, 'Mesa'), 80)
    into event_author
    from (select 1) seed
    left join public.profiles p on p.id = new.actor_id;

  perform pg_notify(
    'maismorras_realtime_v1',
    jsonb_build_object(
      'protocolVersion', 1,
      'eventId', new.id::text,
      'originInstanceId', 'postgres',
      'roomType', 'campaign',
      'campaignId', new.campaign_id::text,
      'payload', jsonb_build_object(
        'type', 'campaign.event',
        'event', jsonb_build_object(
          'id', new.id,
          'author', event_author,
          'type', new.event_type,
          -- Bound the serialized JSON text (not JSONB's internal storage size),
          -- since control characters can expand substantially in the NOTIFY frame.
          'payload', case when octet_length(new.payload::text) <= 3500 then new.payload else null end,
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
