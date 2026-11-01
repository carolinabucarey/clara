-- The hair color a look was tried on with (Clara no longer suggests haircuts).
-- `hairstyle` stays for looks saved before, so their rows keep what they had.

alter table public.looks add column if not exists hair_color jsonb;
