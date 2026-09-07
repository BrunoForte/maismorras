-- Cada ator possui no máximo um token por cena. Tokens sem ator continuam
-- livres para marcadores e objetos de cenário.
create unique index if not exists one_actor_token_per_scene
  on public.scene_tokens(scene_id, actor_id) where actor_id is not null;
