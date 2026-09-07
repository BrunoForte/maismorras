insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campaign-assets', 'campaign-assets', false, 20971520, array['image/jpeg','image/png','image/webp','audio/mpeg','audio/ogg','audio/wav'])
on conflict (id) do nothing;
drop policy if exists "campaign members read assets" on storage.objects;
create policy "campaign members read assets" on storage.objects for select to authenticated using (bucket_id = 'campaign-assets' and exists (select 1 from public.campaign_members m where m.campaign_id::text = (storage.foldername(name))[2] and m.user_id = auth.uid()));
drop policy if exists "gms upload assets" on storage.objects;
create policy "gms upload assets" on storage.objects for insert to authenticated with check (bucket_id = 'campaign-assets' and exists (select 1 from public.campaign_members m where m.campaign_id::text = (storage.foldername(name))[2] and m.user_id = auth.uid() and m.role = 'gm'));
drop policy if exists "gms delete assets" on storage.objects;
create policy "gms delete assets" on storage.objects for delete to authenticated using (bucket_id = 'campaign-assets' and exists (select 1 from public.campaign_members m where m.campaign_id::text = (storage.foldername(name))[2] and m.user_id = auth.uid() and m.role = 'gm'));
