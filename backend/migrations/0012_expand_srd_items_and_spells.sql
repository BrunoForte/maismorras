-- Catálogo mecânico conciso para seleção na ficha. O SRD é a referência para
-- regras completas; esta tabela não reproduz descrições extensas.
with items(name,pt_br,rules) as (values
 ('Club','Porrete','{"category":"weapon","weight":1,"damage":"1d4","damageType":"bludgeoning","attackAbility":"strength","properties":["light"]}'::jsonb),
 ('Greatclub','Clava Grande','{"category":"weapon","weight":5,"damage":"1d8","damageType":"bludgeoning","attackAbility":"strength","properties":["two-handed"]}'::jsonb),
 ('Handaxe','Machadinha','{"category":"weapon","weight":1,"damage":"1d6","damageType":"slashing","attackAbility":"strength","properties":["light","thrown"]}'::jsonb),
 ('Javelin','Azagaia','{"category":"weapon","weight":1,"damage":"1d6","damageType":"piercing","attackAbility":"strength","properties":["thrown"]}'::jsonb),
 ('Mace','Maça','{"category":"weapon","weight":2,"damage":"1d6","damageType":"bludgeoning","attackAbility":"strength","properties":[]}'::jsonb),
 ('Quarterstaff','Bordão','{"category":"weapon","weight":2,"damage":"1d6","versatileDamage":"1d8","damageType":"bludgeoning","attackAbility":"strength","properties":["versatile"]}'::jsonb),
 ('Light Crossbow','Besta Leve','{"category":"weapon","weight":2.5,"damage":"1d8","damageType":"piercing","attackAbility":"dexterity","properties":["ammunition","loading","two-handed"]}'::jsonb),
 ('Shortbow','Arco Curto','{"category":"weapon","weight":1,"damage":"1d6","damageType":"piercing","attackAbility":"dexterity","properties":["ammunition","two-handed"]}'::jsonb),
 ('Rapier','Rapieira','{"category":"weapon","weight":1,"damage":"1d8","damageType":"piercing","attackAbility":"dexterity","properties":["finesse"]}'::jsonb),
 ('Greatsword','Espada Grande','{"category":"weapon","weight":3,"damage":"2d6","damageType":"slashing","attackAbility":"strength","properties":["heavy","two-handed"]}'::jsonb),
 ('Leather Armor','Armadura de Couro','{"category":"armor","weight":5,"armorClassBase":11,"dexterity":"full"}'::jsonb),
 ('Chain Mail','Cota de Malha','{"category":"armor","weight":27.5,"armorClassBase":16,"dexterity":"none","strengthRequirement":13}'::jsonb),
 ('Plate Armor','Armadura de Placas','{"category":"armor","weight":32.5,"armorClassBase":18,"dexterity":"none","strengthRequirement":15}'::jsonb),
 ('Potion of Healing','Poção de Cura','{"category":"consumable","weight":0.25,"charges":1,"effect":"2d4+2 healing"}'::jsonb),
 ('Rations','Rações','{"category":"consumable","weight":1,"charges":1,"effect":"food for one day"}'::jsonb),
 ('Thieves'' Tools','Ferramentas de Ladrão','{"category":"tool","weight":0.5,"ability":"dexterity"}'::jsonb)
)
insert into public.compendium_entries(campaign_id,source_id,entry_type,name,summary,rules,translations,is_published,created_by)
select c.id,s.id,'item',items.name,'Item do índice mecânico do SRD.',items.rules,jsonb_build_object('pt-BR',items.pt_br),true,c.owner_id from public.campaigns c join public.compendium_sources s on s.campaign_id=c.id and s.slug='dnd-srd-5-2-1' cross join items
on conflict (source_id,entry_type,name) do update set rules=excluded.rules,translations=excluded.translations;

with spells(name,pt_br,rules) as (values
 ('Acid Splash','Respingo Ácido','{"level":0,"classes":["sorcerer","wizard"],"school":"evocation","castingTime":"action","range":"60 ft","damage":"acid"}'::jsonb),
 ('Guidance','Orientação','{"level":0,"classes":["cleric","druid"],"school":"divination","castingTime":"action","range":"touch"}'::jsonb),
 ('Light','Luz','{"level":0,"classes":["bard","cleric","sorcerer","wizard"],"school":"evocation","castingTime":"action","range":"touch"}'::jsonb),
 ('Mage Hand','Mão Mágica','{"level":0,"classes":["bard","sorcerer","warlock","wizard"],"school":"conjuration","castingTime":"action","range":"30 ft"}'::jsonb),
 ('Ray of Frost','Raio de Gelo','{"level":0,"classes":["sorcerer","wizard"],"school":"evocation","castingTime":"action","range":"60 ft","damage":"cold"}'::jsonb),
 ('Sacred Flame','Chama Sagrada','{"level":0,"classes":["cleric"],"school":"evocation","castingTime":"action","range":"60 ft","damage":"radiant"}'::jsonb),
 ('Bless','Bênção','{"level":1,"classes":["cleric","paladin"],"school":"enchantment","castingTime":"action","range":"30 ft"}'::jsonb),
 ('Burning Hands','Mãos Flamejantes','{"level":1,"classes":["sorcerer","wizard"],"school":"evocation","castingTime":"action","range":"self","damage":"fire"}'::jsonb),
 ('Charm Person','Enfeitiçar Pessoa','{"level":1,"classes":["bard","druid","sorcerer","warlock","wizard"],"school":"enchantment","castingTime":"action","range":"30 ft"}'::jsonb),
 ('Detect Magic','Detectar Magia','{"level":1,"classes":["bard","cleric","druid","paladin","ranger","sorcerer","wizard"],"school":"divination","castingTime":"action","range":"self"}'::jsonb),
 ('Feather Fall','Queda Suave','{"level":1,"classes":["bard","sorcerer","wizard"],"school":"transmutation","castingTime":"reaction","range":"60 ft"}'::jsonb),
 ('Healing Word','Palavra Curativa','{"level":1,"classes":["bard","cleric","druid"],"school":"abjuration","castingTime":"bonus action","range":"60 ft","effect":"healing"}'::jsonb),
 ('Identify','Identificar','{"level":1,"classes":["bard","wizard"],"school":"divination","castingTime":"minute","range":"touch"}'::jsonb),
 ('Sleep','Sono','{"level":1,"classes":["bard","sorcerer","wizard"],"school":"enchantment","castingTime":"action","range":"90 ft"}'::jsonb),
 ('Thunderwave','Onda Trovejante','{"level":1,"classes":["bard","druid","sorcerer","wizard"],"school":"evocation","castingTime":"action","range":"self","damage":"thunder"}'::jsonb),
 ('Misty Step','Passo Nebuloso','{"level":2,"classes":["sorcerer","warlock","wizard"],"school":"conjuration","castingTime":"bonus action","range":"self"}'::jsonb),
 ('Scorching Ray','Raio Ardente','{"level":2,"classes":["sorcerer","wizard"],"school":"evocation","castingTime":"action","range":"120 ft","damage":"fire"}'::jsonb),
 ('Shatter','Despedaçar','{"level":2,"classes":["bard","sorcerer","wizard"],"school":"evocation","castingTime":"action","range":"60 ft","damage":"thunder"}'::jsonb),
 ('Web','Teia','{"level":2,"classes":["sorcerer","wizard"],"school":"conjuration","castingTime":"action","range":"60 ft"}'::jsonb)
)
insert into public.compendium_entries(campaign_id,source_id,entry_type,name,summary,rules,translations,is_published,created_by)
select c.id,s.id,'spell',spells.name,'Magia do índice mecânico do SRD.',spells.rules,jsonb_build_object('pt-BR',spells.pt_br),true,c.owner_id from public.campaigns c join public.compendium_sources s on s.campaign_id=c.id and s.slug='dnd-srd-5-2-1' cross join spells
on conflict (source_id,entry_type,name) do update set rules=excluded.rules,translations=excluded.translations;
