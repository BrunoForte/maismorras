-- Execute após 0004. Convites por link não exigem serviço de e-mail pago.
create table if not exists public.campaign_invites (
  code uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists campaign_invites_campaign_id on public.campaign_invites(campaign_id);
