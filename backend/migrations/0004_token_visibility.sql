-- Execute após 0003. O narrador controla a informação exposta por token.
alter table public.scene_tokens
  add column if not exists visibility jsonb not null default '{"showName":true,"showHP":false,"showAC":false,"showStatuses":false}'::jsonb,
  add constraint scene_tokens_visibility_object check (jsonb_typeof(visibility) = 'object');

-- Tokens pertencentes a um jogador continuam exibindo sua ficha completa ao dono;
-- as flags acima só regulam o que os demais jogadores recebem da API.
