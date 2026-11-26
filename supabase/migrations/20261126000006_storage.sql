-- =============================================================================
-- 0006  Secure document storage
-- =============================================================================
-- Private bucket; objects are never public. Clients obtain short-lived signed
-- URLs, which Supabase only issues if the SELECT policy below allows it.
--
-- Path convention: {clinic_id}/{patient_id}/{uuid}-{sanitized-filename}
--
-- Upload flow:  1) upload object (INSERT policy checks document.upload on the
--               patient encoded in the path)  2) insert public.documents row.
-- Read flow:    SELECT on the object is allowed only if the caller can see the
--               matching public.documents row — so document-level rules
--               (is_private, archived) apply to the binary as well.
-- Objects are never updated or deleted by clients (retention); archiving is a
-- soft delete on public.documents.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'patient-documents',
  'patient-documents',
  false,
  52428800,  -- 50 MB
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/tiff',
    'application/dicom',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy patient_documents_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'patient-documents'
    and exists (
      select 1 from public.patients p
      where p.id = private.try_uuid((storage.foldername(name))[2])
        and p.clinic_id = private.try_uuid((storage.foldername(name))[1])
    )
    and private.can(private.try_uuid((storage.foldername(name))[2]), 'document.upload')
  );

create policy patient_documents_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'patient-documents'
    and exists (
      select 1 from public.documents d   -- evaluated under documents RLS
      where d.storage_path = storage.objects.name
    )
  );
-- No UPDATE / DELETE policies: stored clinical documents are immutable.
