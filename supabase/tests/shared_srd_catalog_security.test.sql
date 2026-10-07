begin;
select plan(12);

select ok(to_regclass('public.srd_catalog_sources') is not null, 'shared SRD sources table exists');
select ok(to_regclass('public.srd_catalog_entries') is not null, 'shared SRD entries table exists');
select ok(to_regclass('public.campaign_srd_catalog_sources') is not null, 'campaign-to-versioned-catalog mapping exists');
select ok(to_regclass('public.srd_catalog_entry_aliases') is not null, 'legacy entry aliases exist');
select ok(to_regclass('public.campaign_srd_entry_overrides') is not null, 'campaign-only SRD overrides exist');

select ok((select relrowsecurity from pg_class where oid='public.srd_catalog_sources'::regclass), 'shared SRD sources use RLS');
select ok((select relrowsecurity from pg_class where oid='public.srd_catalog_entries'::regclass), 'shared SRD entries use RLS');
select ok((select relrowsecurity from pg_class where oid='public.campaign_srd_catalog_sources'::regclass), 'campaign catalog mappings use RLS');
select ok((select relrowsecurity from pg_class where oid='public.srd_catalog_entry_aliases'::regclass), 'legacy aliases use RLS');
select ok((select relrowsecurity from pg_class where oid='public.campaign_srd_entry_overrides'::regclass), 'campaign overrides use RLS');

select ok(not exists (
  select 1
  from unnest(array['anon','authenticated','service_role']::name[]) as roles(role_name)
  cross join unnest(array[
    'public.srd_catalog_sources'::regclass,
    'public.srd_catalog_entries'::regclass,
    'public.campaign_srd_catalog_sources'::regclass,
    'public.srd_catalog_entry_aliases'::regclass,
    'public.campaign_srd_entry_overrides'::regclass
  ]) as tables(table_name)
  cross join unnest(array['SELECT','INSERT','UPDATE','DELETE']) as privileges(privilege_name)
  where has_table_privilege(roles.role_name,tables.table_name,privileges.privilege_name)
), 'Data API and service roles have no direct catalog or override table privileges');

select ok(not exists (
  select 1 from pg_policies where schemaname='public' and tablename in (
    'srd_catalog_sources','srd_catalog_entries','campaign_srd_catalog_sources',
    'srd_catalog_entry_aliases','campaign_srd_entry_overrides'
  )
), 'no Data API policies expose shared catalog writes or owner translation provenance');

select * from finish();
rollback;
