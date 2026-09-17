-- O fluxo oficial da overlay usa login Supabase no navegador/OBS.
-- Removemos somente as colunas do mecanismo legado por token.
drop index if exists public.campaigns_overlay_token_hash_idx;
alter table public.campaigns
  drop column if exists overlay_token_hash,
  drop column if exists overlay_token_created_at;
