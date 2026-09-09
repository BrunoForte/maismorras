-- Combat movement is stored independently from the token so every new turn
-- starts with a clean budget without modifying the actor or its base speed.
alter table public.scenes
  add column if not exists enforce_turn_order boolean not null default false;

alter table public.scene_tokens
  add column if not exists movement_limit integer not null default 6
  check (movement_limit between 0 and 30);

create table if not exists public.scene_token_turn_movement (
  scene_id uuid not null references public.scenes(id) on delete cascade,
  token_id uuid not null references public.scene_tokens(id) on delete cascade,
  spent_squares numeric(8,2) not null default 0 check (spent_squares >= 0),
  updated_at timestamptz not null default now(),
  primary key (scene_id, token_id)
);
