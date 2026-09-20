-- Campaign ruleset selection. Existing campaigns remain on D&D 2024.
alter table public.campaigns
  add column if not exists system_id text not null default 'dnd2024';

alter table public.campaigns
  drop constraint if exists campaigns_system_id_check;

alter table public.campaigns
  add constraint campaigns_system_id_check
  check (system_id in ('dnd2024', 'dnd35'));

create index if not exists campaigns_system_id_idx on public.campaigns(system_id);
