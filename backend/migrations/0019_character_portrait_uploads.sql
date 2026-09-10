-- Character portraits are readable by campaign members because the rendered
-- token can be seen at the table. Upload rights remain scoped to a player's
-- own folder, rather than granting access to the campaign media library.
drop policy if exists "character owners upload portraits" on storage.objects;
create policy "character owners upload portraits"
on storage.objects for insert to authenticated
with check (
	bucket_id = 'campaign-assets'
	and (storage.foldername(name))[1] = 'campaigns'
	and (storage.foldername(name))[3] = 'portraits'
	and (storage.foldername(name))[4] = auth.uid()::text
	and exists (
		select 1 from public.campaign_members m
		where m.campaign_id::text = (storage.foldername(name))[2]
		and m.user_id = auth.uid()
	)
);
