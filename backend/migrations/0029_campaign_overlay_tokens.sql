alter table public.campaigns
  add column if not exists overlay_token_hash text,
  add column if not exists overlay_token_created_at timestamptz;

create unique index if not exists campaigns_overlay_token_hash_idx
  on public.campaigns(overlay_token_hash)
  where overlay_token_hash is not null;
