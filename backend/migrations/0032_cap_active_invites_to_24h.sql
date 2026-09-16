-- Convites ativos passam a ter validade máxima de 24 horas a partir da criação.
-- Convites já expirados não são reativados.
update public.campaign_invites
set expires_at = created_at + interval '24 hours'
where revoked_at is null
  and expires_at > now()
  and expires_at > created_at + interval '24 hours';

alter table public.campaign_invites
  alter column expires_at set default (now() + interval '24 hours');
