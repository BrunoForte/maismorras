-- Canonical Supabase migration: persistent audio playback and campaign overlay settings.
ALTER TABLE public.scenes
  ADD COLUMN IF NOT EXISTS ambient_audio_position_ms bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ambient_audio_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS ambient_audio_revision bigint NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.campaign_overlay_settings (
  campaign_id uuid PRIMARY KEY REFERENCES public.campaigns(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  cameras jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(cameras) = 'array'),
  active_scene_id uuid REFERENCES public.scenes(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.campaign_overlay_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "campaign members read overlay settings" ON public.campaign_overlay_settings;
CREATE POLICY "campaign members read overlay settings" ON public.campaign_overlay_settings
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.campaign_members m WHERE m.campaign_id = campaign_overlay_settings.campaign_id AND m.user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "campaign gms manage overlay settings" ON public.campaign_overlay_settings;
CREATE POLICY "campaign gms manage overlay settings" ON public.campaign_overlay_settings
  FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.campaign_members m WHERE m.campaign_id = campaign_overlay_settings.campaign_id AND m.user_id = (SELECT auth.uid()) AND m.role = 'gm'::public.campaign_role))
  WITH CHECK (EXISTS (SELECT 1 FROM public.campaign_members m WHERE m.campaign_id = campaign_overlay_settings.campaign_id AND m.user_id = (SELECT auth.uid()) AND m.role = 'gm'::public.campaign_role));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_overlay_settings TO authenticated;