-- Dados mecânicos iniciais e resumidos para demonstrar o motor de ficha.
-- O SRD é a fonte de regras completas; não são reproduzidos textos extensos.
update public.compendium_entries set rules = case name
  when 'Dagger' then '{"category":"weapon","weight":0.5,"damage":"1d4","damageType":"piercing","attackAbility":"dexterity","properties":["finesse","light","thrown"]}'::jsonb
  when 'Longsword' then '{"category":"weapon","weight":1.5,"damage":"1d8","versatileDamage":"1d10","damageType":"slashing","attackAbility":"strength","properties":["versatile"]}'::jsonb
  when 'Shield' then '{"category":"armor","weight":3,"armorClassBonus":2,"properties":["shield"]}'::jsonb
  when 'Spellbook' then '{"category":"gear","weight":1.5,"properties":["spellcasting focus"]}'::jsonb
  else rules end
where entry_type='item' and name in ('Dagger','Longsword','Shield','Spellbook');

update public.compendium_entries set rules = case name
  when 'Fire Bolt' then '{"level":0,"classes":["sorcerer","wizard"],"school":"evocation","castingTime":"action","range":"120 ft","damage":"1d10 fire"}'::jsonb
  when 'Cure Wounds' then '{"level":1,"classes":["bard","cleric","druid","paladin","ranger"],"school":"abjuration","castingTime":"action","range":"touch","effect":"healing"}'::jsonb
  when 'Magic Missile' then '{"level":1,"classes":["sorcerer","wizard"],"school":"evocation","castingTime":"action","range":"120 ft","damage":"1d4+1 force per dart"}'::jsonb
  when 'Shield' then '{"level":1,"classes":["sorcerer","wizard"],"school":"abjuration","castingTime":"reaction","range":"self","effect":"temporary AC bonus"}'::jsonb
  else rules end
where entry_type='spell' and name in ('Fire Bolt','Cure Wounds','Magic Missile','Shield');
