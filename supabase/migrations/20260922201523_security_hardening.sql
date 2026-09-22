-- Close client-side privilege escalation paths. Application mutations go through
-- the Go API; its database connection is trusted and remains unaffected.

-- Profiles: clients may edit display_name, never identity or privilege fields.
drop policy if exists profiles_self_insert on public.profiles;
revoke insert, update, delete, truncate, references, trigger on public.profiles from anon, authenticated;
revoke update (id, display_name, created_at, is_admin) on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

-- Mutable game state is written only through the authorization-checked API.
-- RLS policies remain as defense in depth for any future scoped grants.
revoke insert, update, delete, truncate, references, trigger on
  public.scene_tokens, public.actors, public.campaign_invites,
  public.scene_token_turn_movement from anon, authenticated;

drop policy if exists scene_tokens_owner_write on public.scene_tokens;
create policy scene_tokens_gm_write on public.scene_tokens for all to authenticated
using (
  exists (select 1 from public.scenes s join public.campaigns c on c.id=s.campaign_id
          where s.id=scene_tokens.scene_id and c.owner_id=auth.uid())
  or exists (select 1 from public.scenes s join public.campaign_members m on m.campaign_id=s.campaign_id
             where s.id=scene_tokens.scene_id and m.user_id=auth.uid() and m.role='gm'::public.campaign_role)
) with check (
  exists (select 1 from public.scenes s join public.campaigns c on c.id=s.campaign_id
          where s.id=scene_tokens.scene_id and c.owner_id=auth.uid())
  or exists (select 1 from public.scenes s join public.campaign_members m on m.campaign_id=s.campaign_id
             where s.id=scene_tokens.scene_id and m.user_id=auth.uid() and m.role='gm'::public.campaign_role)
);

drop policy if exists actors_owner_write on public.actors;
create policy actors_owner_write on public.actors for all to authenticated
using (
  (owner_id=auth.uid() and (exists (select 1 from public.campaign_members m where m.campaign_id=actors.campaign_id and m.user_id=auth.uid())
                               or exists (select 1 from public.campaigns c where c.id=actors.campaign_id and c.owner_id=auth.uid())))
  or exists (select 1 from public.campaign_members m where m.campaign_id=actors.campaign_id and m.user_id=auth.uid() and m.role='gm'::public.campaign_role)
  or exists (select 1 from public.campaigns c where c.id=actors.campaign_id and c.owner_id=auth.uid())
) with check (
  (owner_id=auth.uid() and (exists (select 1 from public.campaign_members m where m.campaign_id=actors.campaign_id and m.user_id=auth.uid())
                               or exists (select 1 from public.campaigns c where c.id=actors.campaign_id and c.owner_id=auth.uid())))
  or exists (select 1 from public.campaign_members m where m.campaign_id=actors.campaign_id and m.user_id=auth.uid() and m.role='gm'::public.campaign_role)
  or exists (select 1 from public.campaigns c where c.id=actors.campaign_id and c.owner_id=auth.uid())
);

drop policy if exists invites_gm_select on public.campaign_invites;
create policy invites_gm_select on public.campaign_invites for select to authenticated
using (exists (select 1 from public.campaigns c where c.id=campaign_invites.campaign_id and c.owner_id=auth.uid())
    or exists (select 1 from public.campaign_members m where m.campaign_id=campaign_invites.campaign_id and m.user_id=auth.uid() and m.role='gm'::public.campaign_role));
drop policy if exists invites_gm_write on public.campaign_invites;
create policy invites_gm_write on public.campaign_invites for all to authenticated
using (exists (select 1 from public.campaigns c where c.id=campaign_invites.campaign_id and c.owner_id=auth.uid())
    or exists (select 1 from public.campaign_members m where m.campaign_id=campaign_invites.campaign_id and m.user_id=auth.uid() and m.role='gm'::public.campaign_role))
with check (exists (select 1 from public.campaigns c where c.id=campaign_invites.campaign_id and c.owner_id=auth.uid())
    or exists (select 1 from public.campaign_members m where m.campaign_id=campaign_invites.campaign_id and m.user_id=auth.uid() and m.role='gm'::public.campaign_role));

drop policy if exists movement_owner_write on public.scene_token_turn_movement;
create policy movement_owner_write on public.scene_token_turn_movement for all to authenticated
using (
  exists (select 1 from public.scene_tokens t where t.id=scene_token_turn_movement.token_id
             and t.scene_id=scene_token_turn_movement.scene_id and t.owner_id=auth.uid())
  or exists (select 1 from public.scenes s join public.campaign_members m on m.campaign_id=s.campaign_id
             where s.id=scene_token_turn_movement.scene_id and m.user_id=auth.uid() and m.role='gm'::public.campaign_role)
  or exists (select 1 from public.scenes s join public.campaigns c on c.id=s.campaign_id
             where s.id=scene_token_turn_movement.scene_id and c.owner_id=auth.uid())
) with check (
  exists (select 1 from public.scene_tokens t where t.id=scene_token_turn_movement.token_id
             and t.scene_id=scene_token_turn_movement.scene_id and t.owner_id=auth.uid())
  or exists (select 1 from public.scenes s join public.campaign_members m on m.campaign_id=s.campaign_id
             where s.id=scene_token_turn_movement.scene_id and m.user_id=auth.uid() and m.role='gm'::public.campaign_role)
  or exists (select 1 from public.scenes s join public.campaigns c on c.id=s.campaign_id
             where s.id=scene_token_turn_movement.scene_id and c.owner_id=auth.uid())
);
