-- Enforce selected image/handout visibility at the database boundary too.
-- A GM permission row is the sentinel for a restricted list with no players.

drop policy if exists "campaign members read item permissions"
  on public.library_item_permissions;

create policy "campaign gms read item permissions"
  on public.library_item_permissions for select to authenticated
  using (exists (
    select 1 from public.campaign_members m
    where m.campaign_id = library_item_permissions.campaign_id
      and m.user_id = (select auth.uid())
      and m.role = 'gm'::public.campaign_role
  ));

drop policy if exists notes_member_select on public.notes;
create policy notes_member_select on public.notes
for select to authenticated
using (
  exists (
    select 1 from public.campaign_members m
    where m.campaign_id = notes.campaign_id
      and m.user_id = (select auth.uid())
  )
  and (
    notes.author_id = (select auth.uid())
    or exists (
      select 1 from public.campaign_members gm
      where gm.campaign_id = notes.campaign_id
        and gm.user_id = (select auth.uid())
        and gm.role = 'gm'::public.campaign_role
    )
    or (
      notes.visibility = 'players'::public.note_visibility
      and (
        not exists (
          select 1 from public.library_item_permissions lp
          where lp.campaign_id = notes.campaign_id
            and lp.item_type = 'note'::public.library_item_type
            and lp.item_key = notes.id::text
        )
        or exists (
          select 1 from public.library_item_permissions lp
          where lp.campaign_id = notes.campaign_id
            and lp.item_type = 'note'::public.library_item_type
            and lp.item_key = notes.id::text
            and lp.user_id = (select auth.uid())
        )
      )
    )
  )
);

drop policy if exists "campaign members can read scene presentations"
  on public.scene_presentations;
create policy "campaign members can read permitted presentations"
  on public.scene_presentations for select to authenticated
  using (
    exists (
      select 1 from public.campaign_members m
      where m.campaign_id = scene_presentations.campaign_id
        and m.user_id = (select auth.uid())
        and (
          m.role = 'gm'::public.campaign_role
          or (
            scene_presentations.visible
            and (
              scene_presentations.asset_path = ''
              or not exists (
                select 1 from public.library_item_permissions lp
                where lp.campaign_id = scene_presentations.campaign_id
                  and lp.item_type = 'asset'::public.library_item_type
                  and lp.item_key = scene_presentations.asset_path
              )
              or exists (
                select 1 from public.library_item_permissions lp
                where lp.campaign_id = scene_presentations.campaign_id
                  and lp.item_type = 'asset'::public.library_item_type
                  and lp.item_key = scene_presentations.asset_path
                  and lp.user_id = (select auth.uid())
              )
            )
          )
        )
    )
  );

-- Keep scene maps and character portraits available to campaign members,
-- but apply the library ACL to media and permit audio reads only for the
-- currently playing track. The GM keeps full campaign asset access.
drop policy if exists "campaign members read assets" on storage.objects;
create policy "campaign members read permitted assets"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'campaign-assets'
    and exists (
      select 1 from public.campaign_members m
      where m.campaign_id::text = (storage.foldername(objects.name))[2]
        and m.user_id = (select auth.uid())
        and (
          m.role = 'gm'::public.campaign_role
          or (storage.foldername(objects.name))[3] = 'portraits'
          or (storage.foldername(objects.name))[3] <> 'media'
          or (
            (storage.foldername(objects.name))[3] = 'media'
            and (
              (
                (coalesce(objects.metadata->>'mimetype', '') ilike 'audio/%'
                  or objects.name ~* '\.(mp3|ogg|wav|m4a|aac|flac)$')
                and exists (
                  select 1 from public.scenes s
                  where s.campaign_id = m.campaign_id
                    and s.ambient_audio_path = objects.name
                    and s.ambient_audio_enabled
                )
              )
              or (
                coalesce(objects.metadata->>'mimetype', '') not ilike 'audio/%'
                and objects.name !~* '\.(mp3|ogg|wav|m4a|aac|flac)$'
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
