create type effect_tick as enum ('turn_start', 'turn_end');
create table if not exists public.scene_token_effects (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.scenes(id) on delete cascade,
  token_id uuid not null references public.scene_tokens(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  source text not null default '',
  remaining_turns integer check (remaining_turns is null or remaining_turns > 0),
  tick_at effect_tick not null default 'turn_end',
  created_at timestamptz not null default now()
);
create index if not exists scene_token_effects_token_idx on public.scene_token_effects(token_id);
