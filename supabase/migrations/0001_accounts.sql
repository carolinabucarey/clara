-- Clara accounts: each person's profile and saved looks. Row-level security keeps
-- every row and every file visible only to its owner.

create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  color_profile jsonb not null,
  measured_profile jsonb not null,
  proportions jsonb not null,
  measured_proportions jsonb not null,
  face_shape jsonb,
  goals jsonb not null default '[]'::jsonb,
  beauty_prefs jsonb not null default '{}'::jsonb,
  selfie_path text not null,
  selfie_wide_path text not null,
  body_path text not null,
  consent_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.looks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  pieces jsonb not null,
  outfit_verdict jsonb,
  outfit_path text,
  face_path text,
  makeup jsonb,
  hairstyle jsonb
);

create index looks_user_created_idx on public.looks (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.looks enable row level security;

create policy "Own profile" on public.profiles
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Own looks" on public.looks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Private bucket; every object lives under "<user id>/…".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clara', 'clara', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Own files: read" on storage.objects
  for select to authenticated
  using (bucket_id = 'clara' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Own files: upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'clara' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Own files: replace" on storage.objects
  for update to authenticated
  using (bucket_id = 'clara' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'clara' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Own files: delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'clara' and (storage.foldername(name))[1] = (select auth.uid())::text);
