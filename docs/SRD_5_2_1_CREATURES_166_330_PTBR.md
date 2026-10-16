# SRD 5.2.1 — Criaturas 166–330 (PT-BR)

Base: f07a77651d7d4267ad7ed980275160b0d521d0d6 · Pacote SRD 5.2.1
Total confirmado: 330 criaturas identificadas por entryType=other e rules.catalog=monster. Este lote cobre as 165 restantes.

## Seleção

Ordenação pelo nome-fonte em inglês sem diferenciar maiúsculas/minúsculas, com desempate pela chave other:<nome-fonte>. O lote anterior cobre as posições 1–165. Este lote cobre as posições 166–330, de Hippogriff a Zombie. A chave é estável porque o pacote não fornece id individual.

## Campos localizados

Em cada registro: nome (pt-BR), sumário (pt-BR.summary), tipo/alinhamento, deslocamento, sentidos, idiomas, resistências e imunidades quando presentes, e nome, alcance, dano e descrição das ações existentes. Campos localizados e cotejados receberam .source=reviewed; isso registra revisão editorial da tradução, não certifica regras nem reconstitui lacunas da extração.

## Apresentação

O compêndio consome pt-BR.rules.actions.{i}.{name,description} por translatedCompendiumText. A ficha/bestiário consome pt-BR.rules.* por localizedMonsterField; os campos de distância preservam a unidade ft para conversão pelo formatador formatDistance. Na ausência de uma chave, a interface usa o texto-fonte em inglês. O formato atual deste lote contém actions; não há campos traits ou reactions nas entradas selecionadas.

## Fonte e decisões editoriais

Traduções editoriais do projeto, cotejadas com o conteúdo disponível do SRD 5.2.1 oficial (PDF: https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf), sob CC-BY-4.0; não são traduções oficiais da Wizards of the Coast. O proprietário definiu Tritão Combatente (Merfolk Skirmisher) e aceitou as demais sugestões: Aranha de Fase, Esfinge do Saber e Valentão. Nomes de criaturas sem equivalente consolidado foram mantidos quando apropriado.

## Limitações da fonte importada

A conferência do texto integral ainda não é possível para os blocos de ação abaixo porque a própria fonte local chega truncada. Foram preservadas as fontes e traduzidos somente fragmentos disponíveis. Esses trechos não são descrições completas nem podem ser considerados mecanicamente validados. Não se completou texto por inferência.

### 37 blocos de ação interrompidos na auditoria original

- other:Hippogriff — rules.actions.2.damage e rules.actions.2.description
- other:Hobgoblin Warrior — rules.actions.1.damage e rules.actions.1.description
- other:Magmin — rules.actions.0.damage e rules.actions.0.description
- other:Manticore — rules.actions.2.damage e rules.actions.2.description
- other:Marilith — rules.actions.0.damage e rules.actions.0.description
- other:Medusa — rules.actions.1.damage e rules.actions.1.description
- other:Minotaur of Baphomet — rules.actions.0.damage e rules.actions.0.description
- other:Octopus — rules.actions.1.damage e rules.actions.1.description
- other:Ogre — rules.actions.1.damage e rules.actions.1.description
- other:Ogre Zombie — rules.actions.1.damage e rules.actions.1.description
- other:Oni — rules.actions.0.damage e rules.actions.0.description
- other:Owl — rules.actions.0.damage e rules.actions.0.description
- other:Panther — rules.actions.1.damage e rules.actions.1.description
- other:Pegasus — rules.actions.1.damage e rules.actions.1.description
- other:Phase Spider — rules.actions.0.damage e rules.actions.0.description
- other:Piranha — rules.actions.0.damage e rules.actions.0.description
- other:Planetar — rules.actions.0.damage e rules.actions.0.description
- other:Plesiosaurus — rules.actions.0.damage e rules.actions.0.description
- other:Priest — rules.actions.0.damage e rules.actions.0.description
- other:Priest Acolyte — rules.actions.0.damage e rules.actions.0.description
- other:Purple Worm — rules.actions.1.damage e rules.actions.1.description
- other:Stirge — rules.actions.2.damage e rules.actions.2.description
- other:Stone Giant — rules.actions.1.damage e rules.actions.1.description
- other:Storm Giant — rules.actions.0.damage e rules.actions.0.description
- other:Storm Giant — rules.actions.1.damage e rules.actions.1.description
- other:Troll Limb — rules.actions.0.damage e rules.actions.0.description
- other:Warhorse — rules.actions.0.damage e rules.actions.0.description
- other:Wereboar — rules.actions.0.damage e rules.actions.0.description
- other:Wereboar — rules.actions.1.damage e rules.actions.1.description
- other:Wererat — rules.actions.0.damage e rules.actions.0.description
- other:Weretiger — rules.actions.0.damage e rules.actions.0.description
- other:Werewolf — rules.actions.0.damage e rules.actions.0.description
- other:Wight — rules.actions.0.damage e rules.actions.0.description
- other:Wyvern — rules.actions.1.damage e rules.actions.1.description
- other:Xorn — rules.actions.1.damage e rules.actions.1.description

### Atualização de integridade da fonte

Os 9 campos anteriormente incompletos de Horned Devil, Imp e Lemure (`rules.senses`), Kraken, Ogre Zombie, Otyugh, Pegasus e Pseudodragon (`rules.languages`) e Werebear (`rules.speed`) foram restaurados e cotejados com o SRD 5.2.1 oficial; consulte [`SRD_5_2_1_CREATURE_SOURCE_RESTORATION.md`](SRD_5_2_1_CREATURE_SOURCE_RESTORATION.md). Os blocos de ação inicialmente incompletos foram cotejados nos lotes da auditoria; seus textos completos foram restaurados quando a fonte permitiu, e os blocos indevidos foram removidos após confirmação oficial. Não há ações pendentes no manifesto.

`Venomous Snake.rules.actions.2` (p. 363; Creature Stat Blocks, linhas 13986–13987) era “Hooves”; o bloco oficial contém somente Bite, já presente, e o bloco extra foi removido. `Vulture.rules.actions.1` (p. 363; linhas 14022–14024) também era “Hooves” e foi removido; a ação seguinte e suas chaves de tradução foram mantidas e reindexadas após compactar a lista. Esses ajustes não validam eventuais discrepâncias em outros campos/ações dos registros. O estado de cada alvo consta no [manifesto de auditoria por campo](SRD_5_2_1_CREATURE_ACTION_SOURCE_AUDIT.md).

## Glossário do lote

- Creature types: Aberração, Besta, Celestial, Constructo, Dragão, Elemental, Feérico, Ínfero, Gigante, Humanoide, Monstruosidade, Limo, Planta e Morto-vivo.
- Damage types: Contundente, Perfurante, Cortante, Ácido, Frio, Fogo, Elétrico, Veneno, Psíquico, Radiante, Necrótico, Energia e Trovejante.
- Distâncias mantêm ft para que a apresentação as converta para unidades métricas; números, rolagens e fórmulas não foram modificados.

## Manifesto do lote

- other:Hippogriff — Hippogriff
- other:Hippopotamus — Hippopotamus
- other:Hobgoblin Captain — Hobgoblin Captain
- other:Hobgoblin Warrior — Hobgoblin Warrior
- other:Homunculus — Homunculus
- other:Horned Devil — Horned Devil
- other:Hunter Shark — Hunter Shark
- other:Hydra — Hydra
- other:Hyena — Hyena
- other:Ice Devil — Ice Devil
- other:Ice Mephit — Ice Mephit
- other:Imp — Imp
- other:Incubus — Incubus
- other:Invisible Stalker — Invisible Stalker
- other:Iron Golem — Iron Golem
- other:Jackal — Jackal
- other:Killer Whale — Killer Whale
- other:Knight — Knight
- other:Kobold Warrior — Kobold Warrior
- other:Kraken — Kraken
- other:Lamia — Lamia
- other:Lemure — Lemure
- other:Lich — Lich
- other:Lion — Lion
- other:Lizard — Lizard
- other:Mage — Mage
- other:Magma Mephit — Magma Mephit
- other:Magmin — Magmin
- other:Mammoth — Mammoth
- other:Manticore — Manticore
- other:Marilith — Marilith
- other:Mastiff — Mastiff
- other:Medusa — Medusa
- other:Merfolk Skirmisher — Merfolk Skirmisher
- other:Merrow — Merrow
- other:Mimic — Mimic
- other:Minotaur of Baphomet — Minotaur of Baphomet
- other:Minotaur Skeleton — Minotaur Skeleton
- other:Mule — Mule
- other:Mummy — Mummy
- other:Mummy Lord — Mummy Lord
- other:Nalfeshnee — Nalfeshnee
- other:Night Hag — Night Hag
- other:Nightmare — Nightmare
- other:Noble — Noble
- other:Ochre Jelly — Ochre Jelly
- other:Octopus — Octopus
- other:Ogre — Ogre
- other:Ogre Zombie — Ogre Zombie
- other:Oni — Oni
- other:Otyugh — Otyugh
- other:Owl — Owl
- other:Owlbear — Owlbear
- other:Panther — Panther
- other:Pegasus — Pegasus
- other:Phase Spider — Phase Spider
- other:Piranha — Piranha
- other:Pirate — Pirate
- other:Pirate Captain — Pirate Captain
- other:Pit Fiend — Pit Fiend
- other:Planetar — Planetar
- other:Plesiosaurus — Plesiosaurus
- other:Polar Bear — Polar Bear
- other:Pony — Pony
- other:Priest — Priest
- other:Priest Acolyte — Priest Acolyte
- other:Pseudodragon — Pseudodragon
- other:Pteranodon — Pteranodon
- other:Purple Worm — Purple Worm
- other:Quasit — Quasit
- other:Rakshasa — Rakshasa
- other:Rat — Rat
- other:Raven — Raven
- other:Red Dragon Wyrmling — Red Dragon Wyrmling
- other:Reef Shark — Reef Shark
- other:Remorhaz — Remorhaz
- other:Rhinoceros — Rhinoceros
- other:Riding Horse — Riding Horse
- other:Roc — Roc
- other:Roper — Roper
- other:Rust Monster — Rust Monster
- other:Saber-Toothed Tiger — Saber-Toothed Tiger
- other:Sahuagin Warrior — Sahuagin Warrior
- other:Salamander — Salamander
- other:Satyr — Satyr
- other:Scorpion — Scorpion
- other:Scout — Scout
- other:Sea Hag — Sea Hag
- other:Seahorse — Seahorse
- other:Shadow — Shadow
- other:Shambling Mound — Shambling Mound
- other:Shield Guardian — Shield Guardian
- other:Shrieker Fungus — Shrieker Fungus
- other:Silver Dragon Wyrmling — Silver Dragon Wyrmling
- other:Skeleton — Skeleton
- other:Solar — Solar
- other:Specter — Specter
- other:Sphinx of Lore — Sphinx of Lore
- other:Sphinx of Valor — Sphinx of Valor
- other:Sphinx of Wonder — Sphinx of Wonder
- other:Spider — Spider
- other:Spirit Naga — Spirit Naga
- other:Sprite — Sprite
- other:Spy — Spy
- other:Steam Mephit — Steam Mephit
- other:Stirge — Stirge
- other:Stone Giant — Stone Giant
- other:Stone Golem — Stone Golem
- other:Storm Giant — Storm Giant
- other:Succubus — Succubus
- other:Swarm of Bats — Swarm of Bats
- other:Swarm of Crawling Claws — Swarm of Crawling Claws
- other:Swarm of Insects — Swarm of Insects
- other:Swarm of Piranhas — Swarm of Piranhas
- other:Swarm of Rats — Swarm of Rats
- other:Swarm of Ravens — Swarm of Ravens
- other:Swarm of Venomous Snakes — Swarm of Venomous Snakes
- other:Tarrasque — Tarrasque
- other:Tiger — Tiger
- other:Tough — Tough
- other:Tough Boss — Tough Boss
- other:Treant — Treant
- other:Triceratops — Triceratops
- other:Troll — Troll
- other:Troll Limb — Troll Limb
- other:Tyrannosaurus Rex — Tyrannosaurus Rex
- other:Unicorn — Unicorn
- other:Vampire — Vampire
- other:Vampire Familiar — Vampire Familiar
- other:Vampire Spawn — Vampire Spawn
- other:Venomous Snake — Venomous Snake
- other:Violet Fungus — Violet Fungus
- other:Vrock — Vrock
- other:Vulture — Vulture
- other:Warhorse — Warhorse
- other:Warhorse Skeleton — Warhorse Skeleton
- other:Warrior Infantry — Warrior Infantry
- other:Warrior Veteran — Warrior Veteran
- other:Water Elemental — Water Elemental
- other:Weasel — Weasel
- other:Werebear — Werebear
- other:Wereboar — Wereboar
- other:Wererat — Wererat
- other:Weretiger — Weretiger
- other:Werewolf — Werewolf
- other:White Dragon Wyrmling — White Dragon Wyrmling
- other:Wight — Wight
- other:Will-o’-Wisp — Will-o’-Wisp
- other:Winter Wolf — Winter Wolf
- other:Wolf — Wolf
- other:Worg — Worg
- other:Wraith — Wraith
- other:Wyvern — Wyvern
- other:Xorn — Xorn
- other:Young Black Dragon — Young Black Dragon
- other:Young Blue Dragon — Young Blue Dragon
- other:Young Brass Dragon — Young Brass Dragon
- other:Young Bronze Dragon — Young Bronze Dragon
- other:Young Copper Dragon — Young Copper Dragon
- other:Young Gold Dragon — Young Gold Dragon
- other:Young Green Dragon — Young Green Dragon
- other:Young Red Dragon — Young Red Dragon
- other:Young Silver Dragon — Young Silver Dragon
- other:Young White Dragon — Young White Dragon
- other:Zombie — Zombie


## Estado final da auditoria de ações

O manifesto contabiliza os 187 alvos originais sem duplicações: 124 restaurados/corrigidos, 63 removidos após confirmação e zero pendentes. Os 19 alvos finais (Planetar–Xorn) foram concluídos; a documentação por campo registra a referência oficial de cada entrada. A tradução foi marcada reviewed apenas nos campos textuais cotejados. Dados e divergências de ações fora dos alvos foram preservados.
