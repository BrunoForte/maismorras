-- The official 2024 Free Rules class chapter places each listed subclass
-- directly under its base class. Backfill only these exact SRD 5.2.1 index
-- rows and only when no source-class metadata has been recorded.
with trusted_subclass_classes(name, class_id) as (
  values
    ('Draconic Sorcery', 'sorcerer'),
    ('Evoker', 'wizard'),
    ('Fiend Patron', 'warlock'),
    ('Hunter', 'ranger'),
    ('Oath of Devotion', 'paladin'),
    ('Thief', 'rogue'),
    ('Warrior of the Open Hand', 'monk')
)
update public.srd_catalog_entries as entry
set rules = entry.rules || jsonb_build_object('classId', trusted.class_id),
    updated_at = now()
from public.srd_catalog_sources as catalog_source,
     trusted_subclass_classes as trusted
where entry.source_id = catalog_source.id
  and catalog_source.slug = 'dnd-srd'
  and catalog_source.version = '5.2.1'
  and entry.entry_type = 'subclass'
  and entry.name = trusted.name
  and nullif(btrim(entry.rules->>'classId'), '') is null
  and nullif(btrim(entry.rules->>'className'), '') is null
  and nullif(btrim(entry.rules->>'parentClass'), '') is null;
