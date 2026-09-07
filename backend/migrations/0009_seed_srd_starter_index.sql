-- Índice inicial de nomes do SRD 5.2.1. São referências curtas para as listas
-- da ficha, não uma reprodução de capítulos ou de conteúdo de livros fechados.
insert into public.compendium_sources(campaign_id,slug,title,kind,version,attribution,license_url,is_read_only)
select c.id,'campaign-private','Compêndio privado da campanha','private','','Conteúdo cadastrado privadamente pelo narrador.','',false from public.campaigns c
on conflict (campaign_id,slug) do nothing;

insert into public.compendium_sources(campaign_id,slug,title,kind,version,attribution,license_url,is_read_only)
select c.id,'dnd-srd-5-2-1','D&D System Reference Document','srd','5.2.1','Dungeons & Dragons SRD 5.2.1, disponível sob CC-BY-4.0.','https://www.dndbeyond.com/srd',true from public.campaigns c
on conflict (campaign_id,slug) do nothing;

with starter(entry_type,name,summary) as (
  values
  ('class','Barbarian','Classe presente no índice inicial do SRD.'),('class','Bard','Classe presente no índice inicial do SRD.'),('class','Cleric','Classe presente no índice inicial do SRD.'),('class','Druid','Classe presente no índice inicial do SRD.'),('class','Fighter','Classe presente no índice inicial do SRD.'),('class','Monk','Classe presente no índice inicial do SRD.'),('class','Paladin','Classe presente no índice inicial do SRD.'),('class','Ranger','Classe presente no índice inicial do SRD.'),('class','Rogue','Classe presente no índice inicial do SRD.'),('class','Sorcerer','Classe presente no índice inicial do SRD.'),('class','Warlock','Classe presente no índice inicial do SRD.'),('class','Wizard','Classe presente no índice inicial do SRD.'),
  ('species','Dragonborn','Espécie presente no índice inicial do SRD.'),('species','Dwarf','Espécie presente no índice inicial do SRD.'),('species','Elf','Espécie presente no índice inicial do SRD.'),('species','Gnome','Espécie presente no índice inicial do SRD.'),('species','Goliath','Espécie presente no índice inicial do SRD.'),('species','Halfling','Espécie presente no índice inicial do SRD.'),('species','Human','Espécie presente no índice inicial do SRD.'),('species','Orc','Espécie presente no índice inicial do SRD.'),('species','Tiefling','Espécie presente no índice inicial do SRD.')
)
insert into public.compendium_entries(campaign_id,source_id,entry_type,name,summary,rules,is_published,created_by)
select c.id,s.id,starter.entry_type,starter.name,starter.summary,'{}'::jsonb,true,c.owner_id
from public.campaigns c join public.compendium_sources s on s.campaign_id=c.id and s.slug='dnd-srd-5-2-1' cross join starter
on conflict (source_id,entry_type,name) do nothing;
