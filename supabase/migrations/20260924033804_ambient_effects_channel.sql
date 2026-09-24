alter table public.scenes
  add column if not exists ambient_effect_path text,
  add column if not exists ambient_effect_enabled boolean not null default false,
  add column if not exists ambient_effect_volume integer not null default 65
    check (ambient_effect_volume between 0 and 100),
  add column if not exists ambient_effect_position_ms bigint not null default 0,
  add column if not exists ambient_effect_started_at timestamptz,
  add column if not exists ambient_effect_revision bigint not null default 0;

drop policy if exists "campaign members read permitted assets" on storage.objects;
create policy "campaign members read permitted assets"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'campaign-assets'
    and exists (
      select 1 from public.campaign_members m
      where m.campaign_id::text = (storage.foldername(objects.name))[2]
        and m.user_id = (select auth.uid())
        and (
          m.role = 'gm'
          or (storage.foldername(objects.name))[3] = 'portraits'
          or (storage.foldername(objects.name))[3] <> 'media'
          or (
            (storage.foldername(objects.name))[3] = 'media'
            and (
              (
                (coalesce(objects.metadata->>'mimetype', '') ilike 'audio/%'
                  or objects.name ~* '\\.(mp3|ogg|wav|m4a|aac|flac)$')
                and exists (
                  select 1 from public.scenes s
                  where s.campaign_id = m.campaign_id
                    and (
                      (s.ambient_audio_path = objects.name and s.ambient_audio_enabled)
                      or (s.ambient_effect_path = objects.name and s.ambient_effect_enabled)
                    )
                )
              )
              or (
                coalesce(objects.metadata->>'mimetype', '') not ilike 'audio/%'
                and objects.name !~* '\\.(mp3|ogg|wav|m4a|aac|flac)$'
                and (
                  not exists (
                    select 1 from public.library_item_permissions lp
                    where lp.campaign_id = m.campaign_id
                      and lp.item_type = 'asset'::public.library_item_type
                      and lp.item_key = objects.name
                  )
                  or exists (
                    select 1 from public.library_item_permissions lp
                    where lp.campaign_id = m.campaign_id
                      and lp.item_type = 'asset'::public.library_item_type
                      and lp.item_key = objects.name
                      and lp.user_id = (select auth.uid())
                  )
                )
              )
            )
          )
        )
    )
  );
