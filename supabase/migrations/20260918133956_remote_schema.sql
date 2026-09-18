SET local check_function_bodies = off;

CREATE TABLE "public"."actors" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "campaign_id" uuid                     NOT NULL,
  "owner_id"    uuid,
  "name"        text                     NOT NULL,
  "sheet"       jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "token"       jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "actors_name_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 120))),
  CONSTRAINT "actors_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."actors"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."campaign_invites" (
  "code"        uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "campaign_id" uuid                     NOT NULL,
  "created_by"  uuid                     NOT NULL,
  "expires_at"  timestamp with time zone NOT NULL DEFAULT (now() + '24:00:00'::interval),
  "accepted_by" uuid,
  "accepted_at" timestamp with time zone,
  "revoked_at"  timestamp with time zone,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "campaign_invites_pkey" PRIMARY KEY (code)
);

ALTER TABLE "public"."campaign_invites"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."campaign_members" (
  "campaign_id" uuid                     NOT NULL,
  "user_id"     uuid                     NOT NULL,
  "joined_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "campaign_members_pkey" PRIMARY KEY (campaign_id, user_id)
);

ALTER TABLE "public"."campaign_members"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."campaigns" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"       text                     NOT NULL,
  "owner_id"   uuid                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "campaigns_name_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 120))),
  CONSTRAINT "campaigns_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."campaigns"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."compendium_entries" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "campaign_id"  uuid                     NOT NULL,
  "source_id"    uuid                     NOT NULL,
  "entry_type"   text                     NOT NULL,
  "name"         text                     NOT NULL,
  "summary"      text                     NOT NULL DEFAULT ''::text,
  "rules"        jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "is_published" boolean                  NOT NULL DEFAULT true,
  "created_by"   uuid                     NOT NULL,
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "translations" jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "compendium_entries_entry_type_check"
    CHECK
    ((entry_type = ANY (ARRAY['species'::text, 'background'::text, 'class'::text, 'subclass'::text, 'feat'::text, 'spell'::text, 'item'::text, 'feature'::text, 'other'::text]))),
  CONSTRAINT "compendium_entries_name_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 120))),
  CONSTRAINT "compendium_entries_pkey" PRIMARY KEY (id),
  CONSTRAINT "compendium_entries_source_id_entry_type_name_key" UNIQUE (source_id, entry_type, name),
  CONSTRAINT "compendium_entries_summary_check" CHECK ((char_length(summary) <= 2000))
);

ALTER TABLE "public"."compendium_entries"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."compendium_sources" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "campaign_id"  uuid                     NOT NULL,
  "slug"         text                     NOT NULL,
  "title"        text                     NOT NULL,
  "kind"         text                     NOT NULL,
  "version"      text                     NOT NULL DEFAULT ''::text,
  "attribution"  text                     NOT NULL DEFAULT ''::text,
  "license_url"  text                     NOT NULL DEFAULT ''::text,
  "is_read_only" boolean                  NOT NULL DEFAULT false,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "compendium_sources_campaign_id_slug_key" UNIQUE (campaign_id, slug),
  CONSTRAINT "compendium_sources_kind_check" CHECK ((kind = ANY (ARRAY['srd'::text, 'private'::text, 'homebrew'::text]))),
  CONSTRAINT "compendium_sources_pkey" PRIMARY KEY (id),
  CONSTRAINT "compendium_sources_slug_check" CHECK ((slug ~ '^[a-z0-9-]{2,64}$'::text)),
  CONSTRAINT "compendium_sources_title_check" CHECK (((char_length(title) >= 1) AND (char_length(title) <= 120)))
);

ALTER TABLE "public"."compendium_sources"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."effect_definitions" (
  "slug"      text    NOT NULL,
  "name"      text    NOT NULL,
  "summary"   text    NOT NULL,
  "source"    text    NOT NULL DEFAULT 'D&D SRD 5.2.1'::text,
  "read_only" boolean NOT NULL DEFAULT true,
  CONSTRAINT "effect_definitions_pkey" PRIMARY KEY (slug)
);

ALTER TABLE "public"."effect_definitions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."game_events" (
  "id"          bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "campaign_id" uuid                     NOT NULL,
  "actor_id"    uuid,
  "event_type"  text                     NOT NULL,
  "payload"     jsonb                    NOT NULL,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "game_events_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."game_events"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."notes" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "campaign_id" uuid                     NOT NULL,
  "author_id"   uuid                     NOT NULL,
  "title"       text                     NOT NULL,
  "body"        text                     NOT NULL DEFAULT ''::text,
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "notes_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."notes"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."profiles" (
  "id"           uuid                     NOT NULL,
  "display_name" text                     NOT NULL DEFAULT 'Aventureiro'::text,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "is_admin"     boolean                  NOT NULL DEFAULT false,
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."profiles"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."scene_areas" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "scene_id"           uuid                     NOT NULL,
  "shape"              text                     NOT NULL,
  "start_x"            integer                  NOT NULL,
  "start_y"            integer                  NOT NULL,
  "end_x"              integer                  NOT NULL,
  "end_y"              integer                  NOT NULL,
  "color"              integer                  NOT NULL DEFAULT 14715055,
  "label"              text                     NOT NULL DEFAULT 'Área de efeito'::text,
  "visible_to_players" boolean                  NOT NULL DEFAULT true,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "scene_areas_color_check" CHECK (((color >= 0) AND (color <= 16777215))),
  CONSTRAINT "scene_areas_label_check" CHECK (((char_length(label) >= 1) AND (char_length(label) <= 80))),
  CONSTRAINT "scene_areas_pkey" PRIMARY KEY (id),
  CONSTRAINT "scene_areas_shape_check" CHECK ((shape = ANY (ARRAY['line'::text, 'circle'::text, 'cone'::text])))
);

ALTER TABLE "public"."scene_areas"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."scene_fog_overrides" (
  "scene_id"   uuid                     NOT NULL,
  "cell_x"     integer                  NOT NULL,
  "cell_y"     integer                  NOT NULL,
  "mode"       text                     NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "scene_fog_overrides_mode_check" CHECK ((mode = ANY (ARRAY['reveal'::text, 'hide'::text]))),
  CONSTRAINT "scene_fog_overrides_pkey" PRIMARY KEY (scene_id, cell_x, cell_y)
);

ALTER TABLE "public"."scene_fog_overrides"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."scene_overlay_layouts" (
  "scene_id"    uuid                     NOT NULL,
  "campaign_id" uuid                     NOT NULL,
  "layout"      jsonb                    NOT NULL,
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "scene_overlay_layouts_layout_check" CHECK ((jsonb_typeof(layout) = 'object'::text)),
  CONSTRAINT "scene_overlay_layouts_pkey" PRIMARY KEY (scene_id)
);

ALTER TABLE "public"."scene_overlay_layouts"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."scene_presentations" (
  "scene_id"    uuid                     NOT NULL,
  "campaign_id" uuid                     NOT NULL,
  "asset_path"  text                     NOT NULL,
  "title"       text                     NOT NULL DEFAULT ''::text,
  "visible"     boolean                  NOT NULL DEFAULT true,
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "scene_presentations_pkey" PRIMARY KEY (scene_id)
);

ALTER TABLE "public"."scene_presentations"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."scene_revealed_cells" (
  "scene_id"    uuid                     NOT NULL,
  "cell_x"      integer                  NOT NULL,
  "cell_y"      integer                  NOT NULL,
  "revealed_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "scene_revealed_cells_pkey" PRIMARY KEY (scene_id, cell_x, cell_y)
);

ALTER TABLE "public"."scene_revealed_cells"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."scene_token_effects" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "scene_id"        uuid                     NOT NULL,
  "token_id"        uuid                     NOT NULL,
  "name"            text                     NOT NULL,
  "source"          text                     NOT NULL DEFAULT ''::text,
  "remaining_turns" integer,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "scene_token_effects_name_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 120))),
  CONSTRAINT "scene_token_effects_pkey" PRIMARY KEY (id),
  CONSTRAINT "scene_token_effects_remaining_turns_check" CHECK (((remaining_turns IS NULL) OR (remaining_turns > 0)))
);

ALTER TABLE "public"."scene_token_effects"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."scene_token_turn_movement" (
  "scene_id"      uuid                     NOT NULL,
  "token_id"      uuid                     NOT NULL,
  "spent_squares" numeric(8,2)             NOT NULL DEFAULT 0,
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "scene_token_turn_movement_pkey" PRIMARY KEY (scene_id, token_id),
  CONSTRAINT "scene_token_turn_movement_spent_squares_check" CHECK ((spent_squares >= (0)::numeric))
);

ALTER TABLE "public"."scene_token_turn_movement"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."scene_tokens" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "scene_id"         uuid                     NOT NULL,
  "actor_id"         uuid,
  "owner_id"         uuid,
  "name"             text                     NOT NULL,
  "image_url"        text,
  "color"            integer                  NOT NULL DEFAULT 3381504,
  "position_x"       integer                  NOT NULL DEFAULT 70,
  "position_y"       integer                  NOT NULL DEFAULT 70,
  "size"             integer                  NOT NULL DEFAULT 1,
  "hp_current"       integer                  NOT NULL DEFAULT 10,
  "hp_max"           integer                  NOT NULL DEFAULT 10,
  "armor_class"      integer                  NOT NULL DEFAULT 10,
  "initiative"       integer                  NOT NULL DEFAULT 0,
  "statuses"         jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "is_hidden"        boolean                  NOT NULL DEFAULT false,
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "visibility"       jsonb                    NOT NULL DEFAULT '{"showAC": false, "showHP": false, "showName": true, "showStatuses": false}'::jsonb,
  "initiative_bonus" integer                  NOT NULL DEFAULT 0,
  "vision_range"     integer                  NOT NULL DEFAULT 6,
  "light_range"      integer                  NOT NULL DEFAULT 0,
  "movement_limit"   integer                  NOT NULL DEFAULT 6,
  CONSTRAINT "scene_tokens_armor_class_check" CHECK (((armor_class >= 0) AND (armor_class <= 99))),
  CONSTRAINT "scene_tokens_check" CHECK ((hp_current <= hp_max)),
  CONSTRAINT "scene_tokens_color_check" CHECK (((color >= 0) AND (color <= 16777215))),
  CONSTRAINT "scene_tokens_hp_current_check" CHECK ((hp_current >= 0)),
  CONSTRAINT "scene_tokens_hp_max_check" CHECK ((hp_max > 0)),
  CONSTRAINT "scene_tokens_light_range_check" CHECK (((light_range >= 0) AND (light_range <= 30))),
  CONSTRAINT "scene_tokens_movement_limit_check" CHECK (((movement_limit >= 0) AND (movement_limit <= 30))),
  CONSTRAINT "scene_tokens_name_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 120))),
  CONSTRAINT "scene_tokens_pkey" PRIMARY KEY (id),
  CONSTRAINT "scene_tokens_size_check" CHECK (((size >= 1) AND (size <= 6))),
  CONSTRAINT "scene_tokens_statuses_check" CHECK ((jsonb_typeof(statuses) = 'array'::text)),
  CONSTRAINT "scene_tokens_visibility_object" CHECK ((jsonb_typeof(visibility) = 'object'::text)),
  CONSTRAINT "scene_tokens_vision_range_check" CHECK (((vision_range >= 0) AND (vision_range <= 30)))
);

ALTER TABLE "public"."scene_tokens"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."scene_walls" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "scene_id"   uuid                     NOT NULL,
  "start_x"    integer                  NOT NULL,
  "start_y"    integer                  NOT NULL,
  "end_x"      integer                  NOT NULL,
  "end_y"      integer                  NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "kind"       text                     NOT NULL DEFAULT 'wall'::text,
  "is_open"    boolean                  NOT NULL DEFAULT false,
  CONSTRAINT "scene_walls_check" CHECK (((start_x <> end_x) OR (start_y <> end_y))),
  CONSTRAINT "scene_walls_kind_check" CHECK ((kind = ANY (ARRAY['wall'::text, 'door'::text]))),
  CONSTRAINT "scene_walls_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."scene_walls"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."scenes" (
  "id"                            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "campaign_id"                   uuid                     NOT NULL,
  "name"                          text                     NOT NULL,
  "background_url"                text,
  "grid_size"                     integer                  NOT NULL DEFAULT 70,
  "created_at"                    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                    timestamp with time zone NOT NULL DEFAULT now(),
  "active_token_id"               uuid,
  "allow_player_movement"         boolean                  NOT NULL DEFAULT false,
  "allow_player_door_interaction" boolean                  NOT NULL DEFAULT false,
  "player_access"                 text                     NOT NULL DEFAULT 'available'::text,
  "fog_enabled"                   boolean                  NOT NULL DEFAULT false,
  "vision_mode"                   text                     NOT NULL DEFAULT 'manual'::text,
  "enforce_turn_order"            boolean                  NOT NULL DEFAULT false,
  "ambient_audio_path"            text,
  "ambient_audio_enabled"         boolean                  NOT NULL DEFAULT false,
  "ambient_audio_volume"          integer                  NOT NULL DEFAULT 65,
  CONSTRAINT "scenes_ambient_audio_volume_check" CHECK (((ambient_audio_volume >= 0) AND (ambient_audio_volume <= 100))),
  CONSTRAINT "scenes_grid_size_check" CHECK (((grid_size >= 20) AND (grid_size <= 200))),
  CONSTRAINT "scenes_name_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 120))),
  CONSTRAINT "scenes_pkey" PRIMARY KEY (id),
  CONSTRAINT "scenes_player_access_check" CHECK ((player_access = ANY (ARRAY['hidden'::text, 'available'::text, 'active'::text]))),
  CONSTRAINT "scenes_vision_mode_check" CHECK ((vision_mode = ANY (ARRAY['manual'::text, 'shared'::text, 'token'::text])))
);

ALTER TABLE "public"."scenes"
  ENABLE ROW LEVEL SECURITY;

CREATE TYPE "public"."actor_kind" AS ENUM (
  'character',
  'npc'
);

ALTER TABLE "public"."actors"
  ADD COLUMN "kind" public.actor_kind NOT NULL;

CREATE TYPE "public"."campaign_role" AS ENUM (
  'gm',
  'player'
);

ALTER TABLE "public"."campaign_members"
  ADD COLUMN "role" public.campaign_role NOT NULL DEFAULT 'player'::public.campaign_role;

CREATE TYPE "public"."effect_tick" AS ENUM (
  'turn_start',
  'turn_end'
);

ALTER TABLE "public"."scene_token_effects"
  ADD COLUMN "tick_at" public.effect_tick NOT NULL DEFAULT 'turn_end'::public.effect_tick;

CREATE TYPE "public"."note_visibility" AS ENUM (
  'gm',
  'players'
);

ALTER TABLE "public"."notes"
  ADD COLUMN "visibility" public.note_visibility NOT NULL DEFAULT 'gm'::public.note_visibility;

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', 'Aventureiro')
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

ALTER TABLE "public"."actors"
  ADD CONSTRAINT "actors_check" CHECK ((((kind = 'npc'::public.actor_kind) AND (owner_id IS NULL)) OR ((kind = 'character'::public.actor_kind) AND (owner_id IS NOT NULL))));

ALTER TABLE "public"."actors"
  ADD CONSTRAINT "actors_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;

ALTER TABLE "public"."campaign_invites"
  ADD CONSTRAINT "campaign_invites_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;

ALTER TABLE "public"."campaign_members"
  ADD CONSTRAINT "campaign_members_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;

ALTER TABLE "public"."compendium_entries"
  ADD CONSTRAINT "compendium_entries_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;

ALTER TABLE "public"."compendium_sources"
  ADD CONSTRAINT "compendium_sources_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;

ALTER TABLE "public"."compendium_entries"
  ADD CONSTRAINT "compendium_entries_source_id_fkey" FOREIGN KEY (source_id) REFERENCES public.compendium_sources(id) ON DELETE CASCADE;

ALTER TABLE "public"."game_events"
  ADD CONSTRAINT "game_events_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;

ALTER TABLE "public"."notes"
  ADD CONSTRAINT "notes_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."actors"
  ADD CONSTRAINT "actors_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE "public"."campaign_invites"
  ADD CONSTRAINT "campaign_invites_accepted_by_fkey" FOREIGN KEY (accepted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE "public"."campaign_invites"
  ADD CONSTRAINT "campaign_invites_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."campaign_members"
  ADD CONSTRAINT "campaign_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."campaigns"
  ADD CONSTRAINT "campaigns_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES public.profiles(id);

ALTER TABLE "public"."compendium_entries"
  ADD CONSTRAINT "compendium_entries_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id);

ALTER TABLE "public"."game_events"
  ADD CONSTRAINT "game_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE "public"."notes"
  ADD CONSTRAINT "notes_author_id_fkey" FOREIGN KEY (author_id) REFERENCES public.profiles(id);

ALTER TABLE "public"."scene_overlay_layouts"
  ADD CONSTRAINT "scene_overlay_layouts_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;

ALTER TABLE "public"."scene_presentations"
  ADD CONSTRAINT "scene_presentations_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;

ALTER TABLE "public"."scene_tokens"
  ADD CONSTRAINT "scene_tokens_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES public.actors(id) ON DELETE SET NULL;

ALTER TABLE "public"."scene_tokens"
  ADD CONSTRAINT "scene_tokens_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE "public"."scene_token_effects"
  ADD CONSTRAINT "scene_token_effects_token_id_fkey" FOREIGN KEY (token_id) REFERENCES public.scene_tokens(id) ON DELETE CASCADE;

ALTER TABLE "public"."scene_token_turn_movement"
  ADD CONSTRAINT "scene_token_turn_movement_token_id_fkey" FOREIGN KEY (token_id) REFERENCES public.scene_tokens(id) ON DELETE CASCADE;

ALTER TABLE "public"."scenes"
  ADD CONSTRAINT "scenes_active_token_id_fkey" FOREIGN KEY (active_token_id) REFERENCES public.scene_tokens(id) ON DELETE SET NULL;

ALTER TABLE "public"."scenes"
  ADD CONSTRAINT "scenes_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;

ALTER TABLE "public"."scene_areas"
  ADD CONSTRAINT "scene_areas_scene_id_fkey" FOREIGN KEY (scene_id) REFERENCES public.scenes(id) ON DELETE CASCADE;

ALTER TABLE "public"."scene_fog_overrides"
  ADD CONSTRAINT "scene_fog_overrides_scene_id_fkey" FOREIGN KEY (scene_id) REFERENCES public.scenes(id) ON DELETE CASCADE;

ALTER TABLE "public"."scene_overlay_layouts"
  ADD CONSTRAINT "scene_overlay_layouts_scene_id_fkey" FOREIGN KEY (scene_id) REFERENCES public.scenes(id) ON DELETE CASCADE;

ALTER TABLE "public"."scene_presentations"
  ADD CONSTRAINT "scene_presentations_scene_id_fkey" FOREIGN KEY (scene_id) REFERENCES public.scenes(id) ON DELETE CASCADE;

ALTER TABLE "public"."scene_revealed_cells"
  ADD CONSTRAINT "scene_revealed_cells_scene_id_fkey" FOREIGN KEY (scene_id) REFERENCES public.scenes(id) ON DELETE CASCADE;

ALTER TABLE "public"."scene_token_effects"
  ADD CONSTRAINT "scene_token_effects_scene_id_fkey" FOREIGN KEY (scene_id) REFERENCES public.scenes(id) ON DELETE CASCADE;

ALTER TABLE "public"."scene_token_turn_movement"
  ADD CONSTRAINT "scene_token_turn_movement_scene_id_fkey" FOREIGN KEY (scene_id) REFERENCES public.scenes(id) ON DELETE CASCADE;

ALTER TABLE "public"."scene_tokens"
  ADD CONSTRAINT "scene_tokens_scene_id_fkey" FOREIGN KEY (scene_id) REFERENCES public.scenes(id) ON DELETE CASCADE;

ALTER TABLE "public"."scene_walls"
  ADD CONSTRAINT "scene_walls_scene_id_fkey" FOREIGN KEY (scene_id) REFERENCES public.scenes(id) ON DELETE CASCADE;

CREATE INDEX campaign_invites_campaign_id ON public.campaign_invites USING btree (campaign_id);

CREATE INDEX compendium_entries_campaign_type_idx ON public.compendium_entries USING btree (campaign_id, entry_type, is_published, name);

CREATE INDEX game_events_campaign_id_id ON public.game_events USING btree (campaign_id, id);

CREATE UNIQUE INDEX one_active_scene_per_campaign ON public.scenes USING btree (campaign_id)
  WHERE (player_access = 'active'::text);

CREATE UNIQUE INDEX one_actor_token_per_scene ON public.scene_tokens USING btree (scene_id, actor_id)
  WHERE (actor_id IS NOT NULL);

CREATE UNIQUE INDEX one_character_per_player_per_campaign ON public.actors USING btree (campaign_id, owner_id)
  WHERE (kind = 'character'::public.actor_kind);

CREATE INDEX profiles_admin_idx ON public.profiles USING btree (is_admin)
  WHERE (is_admin = true);

CREATE INDEX scene_areas_scene_idx ON public.scene_areas USING btree (scene_id, created_at);

CREATE INDEX scene_overlay_layouts_campaign_idx ON public.scene_overlay_layouts USING btree (campaign_id);

CREATE INDEX scene_presentations_campaign_idx ON public.scene_presentations USING btree (campaign_id);

CREATE INDEX scene_revealed_cells_scene_idx ON public.scene_revealed_cells USING btree (scene_id);

CREATE INDEX scene_token_effects_token_idx ON public.scene_token_effects USING btree (token_id);

CREATE INDEX scene_tokens_scene_id ON public.scene_tokens USING btree (scene_id);

CREATE INDEX scene_walls_scene_idx ON public.scene_walls USING btree (scene_id, created_at);

CREATE INDEX scenes_campaign_id ON public.scenes USING btree (campaign_id);

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "members can read own campaign memberships" ON "public"."campaign_members"
  FOR SELECT
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "campaign gms can write overlay layouts" ON "public"."scene_overlay_layouts"
  FOR ALL
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.campaign_members m
  WHERE ((m.campaign_id = scene_overlay_layouts.campaign_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'gm'::public.campaign_role)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.campaign_members m
  WHERE ((m.campaign_id = scene_overlay_layouts.campaign_id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'gm'::public.campaign_role)))));

CREATE POLICY "campaign members can read overlay layouts" ON "public"."scene_overlay_layouts"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.campaign_members m
  WHERE ((m.campaign_id = scene_overlay_layouts.campaign_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))));

CREATE POLICY "campaign gms can write scene presentations" ON "public"."scene_presentations"
  FOR ALL
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.campaign_members m
  WHERE ((m.campaign_id = scene_presentations.campaign_id) AND (m.user_id = auth.uid()) AND (m.role = 'gm'::public.campaign_role)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.campaign_members m
  WHERE ((m.campaign_id = scene_presentations.campaign_id) AND (m.user_id = auth.uid()) AND (m.role = 'gm'::public.campaign_role)))));

CREATE POLICY "campaign members can read scene presentations" ON "public"."scene_presentations"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.campaign_members m
  WHERE ((m.campaign_id = scene_presentations.campaign_id) AND (m.user_id = auth.uid())))));

CREATE POLICY "campaign members read assets" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'campaign-assets'::text) AND (EXISTS ( SELECT 1
   FROM public.campaign_members m
  WHERE (((m.campaign_id)::text = (storage.foldername(objects.name))[2]) AND (m.user_id = auth.uid()))))));

CREATE POLICY "character owners upload portraits" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH
    CHECK
    (((bucket_id = 'campaign-assets'::text) AND ((storage.foldername(name))[1] = 'campaigns'::text) AND ((storage.foldername(name))[3] = 'portraits'::text) AND
    ((storage.foldername(name))[4] = (auth.uid())::text) AND (EXISTS ( SELECT 1
   FROM public.campaign_members m
  WHERE (((m.campaign_id)::text = (storage.foldername(objects.name))[2]) AND (m.user_id = auth.uid()))))));

CREATE POLICY "gms delete assets" ON "storage"."objects"
  FOR DELETE
  TO "authenticated"
  USING (((bucket_id = 'campaign-assets'::text) AND (EXISTS ( SELECT 1
   FROM public.campaign_members m
  WHERE (((m.campaign_id)::text = (storage.foldername(objects.name))[2]) AND (m.user_id = auth.uid()) AND (m.role = 'gm'::public.campaign_role))))));

CREATE POLICY "gms upload assets" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((bucket_id = 'campaign-assets'::text) AND (EXISTS ( SELECT 1
   FROM public.campaign_members m
  WHERE (((m.campaign_id)::text = (storage.foldername(objects.name))[2]) AND (m.user_id = auth.uid()) AND (m.role = 'gm'::public.campaign_role))))));

REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."actors" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaign_invites" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaign_members" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."campaigns" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."compendium_entries" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."compendium_sources" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."effect_definitions" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."game_events" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."notes" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."scene_areas" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."scene_fog_overrides" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."scene_overlay_layouts" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."scene_presentations" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."scene_revealed_cells" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."scene_token_effects" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."scene_token_turn_movement" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."scene_tokens" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."scene_walls" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."scenes" TO "anon", "authenticated", "postgres", "service_role";

GRANT USAGE ON TYPE "public"."actor_kind" TO "postgres";

GRANT USAGE ON TYPE "public"."campaign_role" TO "postgres";

GRANT USAGE ON TYPE "public"."effect_tick" TO "postgres";

GRANT USAGE ON TYPE "public"."note_visibility" TO "postgres";

