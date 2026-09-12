-- Incremental production hardening. The Go API uses the database owner
-- connection; direct anonymous/authenticated Supabase access remains denied
-- until an explicit policy is created.
alter table if exists public.compendium_sources enable row level security;
