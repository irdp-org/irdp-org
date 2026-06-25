-- 0012_avatars_public.sql
-- Make avatars bucket public so clients can use direct URLs (no signed URL API calls)
-- Avatars are profile photos — not sensitive; any authenticated user could already view them.

update storage.buckets set public = true where id = 'avatars';

-- Drop the select policy that restricted to authenticated only
-- (public bucket serves files to anyone with the URL, write/delete still restricted via existing policies)
drop policy if exists avatars_select on storage.objects;
