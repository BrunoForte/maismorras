-- Pin campaigns to an immutable ruleset release. Existing campaigns keep the
-- current D&D 2024 rules while future systems can ship independent versions.
alter table public.campaigns
  add column if not exists system_version text not null default '1.0.0';

alter table public.campaigns
  drop constraint if exists campaigns_system_version_check;

alter table public.campaigns
  add constraint campaigns_system_version_check
  check (system_version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$');
