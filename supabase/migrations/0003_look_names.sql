-- The name a person gives a saved look (optional).

alter table public.looks add column if not exists name text check (char_length(name) <= 60);
