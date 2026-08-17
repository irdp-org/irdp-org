-- =============================================================================
-- IRDP — bucket สำหรับโลโก้หลักสูตร (training_courses.logo_url)
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('training-logos', 'training-logos', true, 3145728,
     array['image/jpeg','image/png','image/webp','image/svg+xml'])
on conflict (id) do nothing;

drop policy if exists training_logos_select on storage.objects;
drop policy if exists training_logos_write on storage.objects;
drop policy if exists training_logos_update on storage.objects;
drop policy if exists training_logos_delete on storage.objects;

create policy training_logos_select on storage.objects for select
  using (bucket_id = 'training-logos');

create policy training_logos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'training-logos');

create policy training_logos_update on storage.objects for update to authenticated
  using (bucket_id = 'training-logos')
  with check (bucket_id = 'training-logos');

create policy training_logos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'training-logos');
