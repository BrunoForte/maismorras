-- Canal persistido e independente para efeitos sonoros em loop.
alter table public.scenes
  add column if not exists ambient_effect_path text,
  add column if not exists ambient_effect_enabled boolean not null default false,
  add column if not exists ambient_effect_volume integer not null default 65
    check (ambient_effect_volume between 0 and 100),
  add column if not exists ambient_effect_position_ms bigint not null default 0,
  add column if not exists ambient_effect_started_at timestamptz,
  add column if not exists ambient_effect_revision bigint not null default 0;
