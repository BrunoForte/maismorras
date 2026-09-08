create table if not exists public.effect_definitions (
  slug text primary key,
  name text not null,
  summary text not null,
  source text not null default 'D&D SRD 5.2.1',
  read_only boolean not null default true
);
insert into public.effect_definitions(slug,name,summary) values
 ('blinded','Cego','Não enxerga e falha em testes que dependem da visão.'),
 ('charmed','Enfeitiçado','Não pode atacar quem o enfeitiçou e sofre influência social dele.'),
 ('deafened','Surdo','Não ouve e falha em testes que dependem da audição.'),
 ('frightened','Amedrontado','Tem desvantagem enquanto percebe a fonte do medo.'),
 ('grappled','Agarrado','Seu deslocamento é reduzido a zero.'),
 ('incapacitated','Incapacitado','Não pode realizar ações ou reações.'),
 ('invisible','Invisível','Não pode ser visto sem meios especiais.'),
 ('paralyzed','Paralisado','Está incapacitado, não se move e falha em testes físicos.'),
 ('petrified','Petrificado','É transformado em substância inanimada e fica incapacitado.'),
 ('poisoned','Envenenado','Tem desvantagem em ataques e testes de habilidade.'),
 ('prone','Caído','Só pode rastejar até se levantar.'),
 ('restrained','Impedido','Deslocamento zero e ataques contra ele têm vantagem.'),
 ('stunned','Atordoado','Está incapacitado, não se move e falha em testes físicos.'),
 ('unconscious','Inconsciente','Está incapacitado, caído e não percebe o ambiente.')
on conflict (slug) do update set name=excluded.name,summary=excluded.summary;
