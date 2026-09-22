-- Read-only report for the cleanup worker. Never execute DELETE directly from the client.
select ca.id, ca.campaign_id, ca.path, ca.thumbnail_path, ca.created_at
from public.campaign_assets ca
where ca.deleted_at is null
  and ca.orphaned_at < now() - interval '7 days'
  and not exists (select 1 from public.scenes s where s.background_url = ca.path or s.ambient_audio_path = ca.path)
order by ca.orphaned_at asc;
