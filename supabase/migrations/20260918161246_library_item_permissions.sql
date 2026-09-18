CREATE TYPE public.library_item_type AS ENUM ('asset', 'note');

CREATE TABLE public.library_item_permissions (
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  item_type public.library_item_type NOT NULL,
  item_key text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, item_type, item_key, user_id)
);

CREATE INDEX library_item_permissions_user_idx
  ON public.library_item_permissions (campaign_id, user_id, item_type);

ALTER TABLE public.library_item_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign members read item permissions"
  ON public.library_item_permissions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaign_members m
    WHERE m.campaign_id = library_item_permissions.campaign_id
      AND m.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "campaign gms manage item permissions"
  ON public.library_item_permissions FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaign_members m
    WHERE m.campaign_id = library_item_permissions.campaign_id
      AND m.user_id = (SELECT auth.uid())
      AND m.role = 'gm'::public.campaign_role
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.campaign_members m
    WHERE m.campaign_id = library_item_permissions.campaign_id
      AND m.user_id = (SELECT auth.uid())
      AND m.role = 'gm'::public.campaign_role
  ));

GRANT SELECT, INSERT, DELETE ON public.library_item_permissions TO authenticated;