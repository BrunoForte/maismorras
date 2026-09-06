-- Execute após 0005. Mantém o turno atual por cena sem duplicar a ordem,
-- que continua sendo definida pelo campo initiative de cada scene_token.
alter table public.scenes
  add column if not exists active_token_id uuid references public.scene_tokens(id) on delete set null;
