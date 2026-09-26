-- Short-lived one-time pairing codes and revocable read-only OBS grants.
-- These tables are server-only; access is mediated by the Go API.
create table if not exists public.overlay_pairing_codes (
  code_hash text primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.overlay_access_sessions (
  token_hash text primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists overlay_pairing_codes_expiry_idx
  on public.overlay_pairing_codes (expires_at) where consumed_at is null;
create index if not exists overlay_access_sessions_campaign_idx
  on public.overlay_access_sessions (campaign_id, expires_at) where revoked_at is null;

alter table public.overlay_pairing_codes enable row level security;
alter table public.overlay_access_sessions enable row level security;
revoke all on public.overlay_pairing_codes, public.overlay_access_sessions from anon, authenticated;

