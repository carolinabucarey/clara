-- The whole look on the full-body photo, and when a saved look was last edited.

alter table public.looks add column if not exists full_look_path text;
alter table public.looks add column if not exists updated_at timestamptz not null default now();
