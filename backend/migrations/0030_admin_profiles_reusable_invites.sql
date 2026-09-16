-- Perfil administrativo e convites reutilizáveis por 24 horas.
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

alter table public.campaign_invites
  alter column expires_at set default (now() + interval '24 hours');

create index if not exists profiles_admin_idx
  on public.profiles(is_admin) where is_admin = true;
