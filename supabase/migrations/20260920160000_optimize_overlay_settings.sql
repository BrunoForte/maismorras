-- Optimize overlay settings authorization and scene lookup.
CREATE INDEX IF NOT EXISTS campaign_overlay_settings_active_scene_idx
  ON public.campaign_overlay_settings(active_scene_id);

DROP POLICY IF EXISTS "campaign gms manage overlay settings" ON public.campaign_overlay_settings;
DROP POLICY IF EXISTS "campaign gms insert overlay settings" ON public.campaign_overlay_settings;
CREATE POLICY "campaign gms insert overlay settings" ON public.campaign_overlay_settings
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.campaign_members m
    WHERE m.campaign_id = campaign_overlay_settings.campaign_id
      AND m.user_id = (SELECT auth.uid())
      AND m.role = 'gm'::public.campaign_role
  ));
DROP POLICY IF EXISTS "campaign gms update overlay settings" ON public.campaign_overlay_settings;
CREATE POLICY "campaign gms update overlay settings" ON public.campaign_overlay_settings
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaign_members m
    WHERE m.campaign_id = campaign_overlay_settings.campaign_id
      AND m.user_id = (SELECT auth.uid())
      AND m.role = 'gm'::public.campaign_role
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.campaign_members m
    WHERE m.campaign_id = campaign_overlay_settings.campaign_id
      AND m.user_id = (SELECT auth.uid())
      AND m.role = 'gm'::public.campaign_role
  ));
DROP POLICY IF EXISTS "campaign gms delete overlay settings" ON public.campaign_overlay_settings;
CREATE POLICY "campaign gms delete overlay settings" ON public.campaign_overlay_settings
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaign_members m
    WHERE m.campaign_id = campaign_overlay_settings.campaign_id
      AND m.user_id = (SELECT auth.uid())
      AND m.role = 'gm'::public.campaign_role
  ));