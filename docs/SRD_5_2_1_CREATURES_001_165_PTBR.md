# SRD 5.2.1 — Criaturas 001–165 (PT-BR)

Base: `e4e93840f491ddc5dc369504c0bb0e1dc413cf60` · Pacote SRD 5.2.1
Total confirmado: 330 entradas de criatura (identificadas por `entryType=other` e `rules.catalog=monster`). Lote: 165.

## Critério e identidade

Ordenação pelo nome-fonte em inglês, sem diferenciar maiúsculas/minúsculas; desempate pela chave estável `other:<name>`. O pacote não contém um campo `id` por registro; a identidade catalogada usa origem, tipo e nome. O lote seguinte começa em **Hippogriff** e contém as 165 entradas restantes.

## Campos localizados

Para cada uma das 165 entradas: nome (`pt-BR`), sumário factual (`pt-BR.summary`), tipo/alinhamento (`pt-BR.rules.creatureType`), deslocamento, sentidos e idiomas quando existentes, e campos existentes de ação (`name`, `damage`, `range`, `description`). Campos efetivamente conferidos com a fonte recebem `.source=reviewed`; os campos de ação pendentes do manifesto estão sem esse marcador. `reviewed` registra revisão textual, não validação mecânica geral do bloco de estatísticas.

A interface do compêndio lê `pt-BR.rules.actions.{i}.name/description` por `translatedCompendiumText`; a ficha/bestiário lê as chaves `pt-BR.rules.*` por `localizedMonsterField`. Os campos de ação agora usam essas chaves e o alcance passa por `formatDistance`, que preserva a conversão de pés para unidades métricas. Quando a chave não existe, o texto-fonte continua como fallback. Nos registros do pacote, o bloco aninhado presente é `actions`; não há matrizes de `traits` ou `reactions` para este lote.

## Decisões editoriais

- Traduções editoriais do projeto, cotejadas com o SRD 5.2.1; nos campos incompletos da extração, a conferência integral permanece pendente. Não são traduções oficiais da Wizards of the Coast. Fonte consultada: [SRD 5.2.1 oficial (PDF)](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf).
- Nomes de criaturas foram localizados com termos PT-BR correntes; nomes de espécies fantásticas sem equivalente estável foram preservados (por exemplo, Aboleth, Ankheg, Balor, Behir, Berserker, Bulette, Chuul, Cloaker, Couatl, Deva, Doppelganger, Dretch, Drider, Ettercap, Ettin, Glabrezu, Grick, Grimlock e Hezrou).
- Sumários foram redigidos como resumos factuais do tipo/alinhamento e ND já presentes no pacote; nenhum dado narrativo ou regra foi acrescentado.
- Vocabulário aplicado: Aberração, Besta, Celestial, Constructo, Dragão, Elemental, Feérico, Ínfero, Gigante, Humanoide, Monstruosidade, Limo, Planta, Morto-vivo; tipos de dano Contundente, Perfurante, Cortante, Ácido, Frio, Fogo, Elétrico, Veneno, Psíquico, Trovejante, Energia e Necrótico; condições segundo o glossário do projeto.
- Distâncias mantêm o token de unidade fonte `ft` na chave localizada para que o formatador da interface faça a conversão métrica; nenhum valor numérico foi alterado.
- Os campos mecânicos e fontes não foram modificados. Um teste verifica um digest dos dados do pacote excluindo apenas `translations`.

## Pendências de auditoria da fonte importada

O lote 001–165 continha 150 alvos de ação. Até esta etapa, 21 foram conferidos e restaurados/traduzidos e oito foram removidos após cotejo oficial; **121 alvos continuam pendentes**. Os alvos abaixo permanecem sem `.source=reviewed`; a tradução de fragmento não é considerada completa nem mecanicamente validada.

- `other:Animated Rug of Smothering.rules.actions.0`
- `other:Ankylosaurus.rules.actions.0`
- `other:Archelon.rules.actions.0`
- `other:Awakened Tree.rules.actions.0`
- `other:Baboon.rules.actions.0`
- `other:Badger.rules.actions.0`
- `other:Balor.rules.actions.0`
- `other:Balor.rules.actions.1`
- `other:Bandit.rules.actions.0`
- `other:Bandit Captain.rules.actions.0`
- `other:Barbed Devil.rules.actions.0`
- `other:Barbed Devil.rules.actions.1`
- `other:Bat.rules.actions.0`
- `other:Bearded Devil.rules.actions.0`
- `other:Bearded Devil.rules.actions.1`
- `other:Behir.rules.actions.0`
- `other:Blue Dragon Wyrmling.rules.actions.0`
- `other:Blue Dragon Wyrmling.rules.actions.1`
- `other:Bone Devil.rules.actions.0`
- `other:Bone Devil.rules.actions.1`
- `other:Brass Dragon Wyrmling.rules.actions.0`
- `other:Bronze Dragon Wyrmling.rules.actions.0`
- `other:Bronze Dragon Wyrmling.rules.actions.1`
- `other:Bugbear Stalker.rules.actions.0`
- `other:Bugbear Warrior.rules.actions.0`
- `other:Bulette.rules.actions.0`
- `other:Camel.rules.actions.1`
- `other:Cat.rules.actions.0`
- `other:Cat.rules.actions.2`
- `other:Centaur Trooper.rules.actions.0`
- `other:Chimera.rules.actions.0`
- `other:Chuul.rules.actions.0`
- `other:Clay Golem.rules.actions.0`
- `other:Cloaker.rules.actions.0`
- `other:Cloaker.rules.actions.1`
- `other:Commoner.rules.actions.1`
- `other:Constrictor Snake.rules.actions.0`
- `other:Constrictor Snake.rules.actions.1`
- `other:Copper Dragon Wyrmling.rules.actions.0`
- `other:Crab.rules.actions.0`
- `other:Crab.rules.actions.1`
- `other:Cultist.rules.actions.1`
- `other:Cultist.rules.actions.2`
- `other:Cultist Fanatic.rules.actions.0`
- `other:Cultist Fanatic.rules.actions.1`
- `other:Darkmantle.rules.actions.0`
- `other:Death Dog.rules.actions.0`
- `other:Deer.rules.actions.2`
- `other:Deva.rules.actions.0`
- `other:Dire Wolf.rules.actions.1`
- `other:Dire Wolf.rules.actions.2`
- `other:Djinni.rules.actions.0`
- `other:Djinni.rules.actions.1`
- `other:Draft Horse.rules.actions.0`
- `other:Draft Horse.rules.actions.1`
- `other:Draft Horse.rules.actions.2`
- `other:Dragon Turtle.rules.actions.1`
- `other:Druid.rules.actions.0`
- `other:Eagle.rules.actions.0`
- `other:Eagle.rules.actions.1`
- `other:Eagle.rules.actions.2`
- `other:Earth Elemental.rules.actions.0`
- `other:Elephant.rules.actions.0`
- `other:Elephant.rules.actions.1`
- `other:Elephant.rules.actions.2`
- `other:Elk.rules.actions.0`
- `other:Elk.rules.actions.1`
- `other:Erinyes.rules.actions.0`
- `other:Fire Elemental.rules.actions.0`
- `other:Flying Snake.rules.actions.0`
- `other:Flying Snake.rules.actions.1`
- `other:Frog.rules.actions.0`
- `other:Frog.rules.actions.1`
- `other:Frost Giant.rules.actions.1`
- `other:Ghast.rules.actions.1`
- `other:Ghoul.rules.actions.1`
- `other:Giant Ape.rules.actions.0`
- `other:Giant Badger.rules.actions.1`
- `other:Giant Bat.rules.actions.1`
- `other:Giant Boar.rules.actions.0`
- `other:Giant Boar.rules.actions.2`
- `other:Giant Centipede.rules.actions.1`
- `other:Giant Constrictor Snake.rules.actions.0`
- `other:Giant Constrictor Snake.rules.actions.2`
- `other:Giant Crab.rules.actions.1`
- `other:Giant Crab.rules.actions.2`
- `other:Giant Crocodile.rules.actions.0`
- `other:Giant Crocodile.rules.actions.1`
- `other:Giant Eagle.rules.actions.1`
- `other:Giant Elk.rules.actions.0`
- `other:Giant Octopus.rules.actions.1`
- `other:Giant Owl.rules.actions.0`
- `other:Giant Owl.rules.actions.1`
- `other:Giant Rat.rules.actions.0`
- `other:Giant Rat.rules.actions.3`
- `other:Giant Scorpion.rules.actions.2`
- `other:Giant Seahorse.rules.actions.0`
- `other:Giant Venomous Snake.rules.actions.1`
- `other:Giant Vulture.rules.actions.0`
- `other:Giant Weasel.rules.actions.1`
- `other:Giant Wolf Spider.rules.actions.1`
- `other:Giant Wolf Spider.rules.actions.2`
- `other:Glabrezu.rules.actions.0`
- `other:Gnoll Warrior.rules.actions.2`
- `other:Goat.rules.actions.0`
- `other:Goat.rules.actions.1`
- `other:Goblin Boss.rules.actions.0`
- `other:Goblin Boss.rules.actions.1`
- `other:Goblin Boss.rules.actions.2`
- `other:Goblin Minion.rules.actions.1`
- `other:Goblin Warrior.rules.actions.0`
- `other:Goblin Warrior.rules.actions.1`
- `other:Gold Dragon Wyrmling.rules.actions.0`
- `other:Gorgon.rules.actions.0`
- `other:Green Dragon Wyrmling.rules.actions.0`
- `other:Grick.rules.actions.3`
- `other:Griffon.rules.actions.1`
- `other:Grimlock.rules.actions.0`
- `other:Grimlock.rules.actions.1`
- `other:Guardian Naga.rules.actions.0`
- `other:Hawk.rules.actions.0`

O manifesto [por campo](SRD_5_2_1_CREATURE_ACTION_SOURCE_AUDIT.md) registra o estado global dos 187 alvos. Dez ações `Rend` de dragões adultos e sete de dragões ancestrais foram restauradas e cotejadas com o SRD 5.2.1 (páginas registradas no manifesto) e com os blocos oficiais [Creature Stat Blocks](https://www.dndbeyond.com/sources/dnd/br-2024/creature-stat-blocks).

## Atualização de integridade da fonte

Os 8 campos anteriormente truncados de Barbed Devil, Bearded Devil, Bone Devil e Chain Devil (`rules.senses`), Blink Dog, Dretch, Giant Elk e Giant Owl (`rules.languages`) foram restaurados e cotejados com o SRD 5.2.1 oficial; consulte [`SRD_5_2_1_CREATURE_SOURCE_RESTORATION.md`](SRD_5_2_1_CREATURE_SOURCE_RESTORATION.md). Da lista inicial de 150 ações, 21 foram conferidas e restauradas/traduzidas, e oito foram removidas após cotejo oficial; os outros 121 seguem pendentes e inalterados.

`Basilisk.rules.actions.1` foi removida: o bloco oficial (p. 262; Creature Stat Blocks, linhas 732–736) contém Bite e Petrifying Gaze em Bonus Actions, não Beard. A remoção não certifica as demais ações do registro.

## Seleção do lote

- `other:Aboleth` — **Aboleth**
- `other:Adult Black Dragon` — **Adult Black Dragon**
- `other:Adult Blue Dragon` — **Adult Blue Dragon**
- `other:Adult Brass Dragon` — **Adult Brass Dragon**
- `other:Adult Bronze Dragon` — **Adult Bronze Dragon**
- `other:Adult Copper Dragon` — **Adult Copper Dragon**
- `other:Adult Gold Dragon` — **Adult Gold Dragon**
- `other:Adult Green Dragon` — **Adult Green Dragon**
- `other:Adult Red Dragon` — **Adult Red Dragon**
- `other:Adult Silver Dragon` — **Adult Silver Dragon**
- `other:Adult White Dragon` — **Adult White Dragon**
- `other:Air Elemental` — **Air Elemental**
- `other:Allosaurus` — **Allosaurus**
- `other:Ancient Black Dragon` — **Ancient Black Dragon**
- `other:Ancient Blue Dragon` — **Ancient Blue Dragon**
- `other:Ancient Brass Dragon` — **Ancient Brass Dragon**
- `other:Ancient Bronze Dragon` — **Ancient Bronze Dragon**
- `other:Ancient Copper Dragon` — **Ancient Copper Dragon**
- `other:Ancient Gold Dragon` — **Ancient Gold Dragon**
- `other:Ancient Green Dragon` — **Ancient Green Dragon**
- `other:Ancient Red Dragon` — **Ancient Red Dragon**
- `other:Ancient Silver Dragon` — **Ancient Silver Dragon**
- `other:Ancient White Dragon` — **Ancient White Dragon**
- `other:Animated Armor` — **Animated Armor**
- `other:Animated Flying Sword` — **Animated Flying Sword**
- `other:Animated Rug of Smothering` — **Animated Rug of Smothering**
- `other:Ankheg` — **Ankheg**
- `other:Ankylosaurus` — **Ankylosaurus**
- `other:Ape` — **Ape**
- `other:Archelon` — **Archelon**
- `other:Archmage` — **Archmage**
- `other:Assassin` — **Assassin**
- `other:Awakened Shrub` — **Awakened Shrub**
- `other:Awakened Tree` — **Awakened Tree**
- `other:Axe Beak` — **Axe Beak**
- `other:Azer Sentinel` — **Azer Sentinel**
- `other:Baboon` — **Baboon**
- `other:Badger` — **Badger**
- `other:Balor` — **Balor**
- `other:Bandit` — **Bandit**
- `other:Bandit Captain` — **Bandit Captain**
- `other:Barbed Devil` — **Barbed Devil**
- `other:Basilisk` — **Basilisk**
- `other:Bat` — **Bat**
- `other:Bearded Devil` — **Bearded Devil**
- `other:Behir` — **Behir**
- `other:Berserker` — **Berserker**
- `other:Black Bear` — **Black Bear**
- `other:Black Dragon Wyrmling` — **Black Dragon Wyrmling**
- `other:Black Pudding` — **Black Pudding**
- `other:Blink Dog` — **Blink Dog**
- `other:Blood Hawk` — **Blood Hawk**
- `other:Blue Dragon Wyrmling` — **Blue Dragon Wyrmling**
- `other:Boar` — **Boar**
- `other:Bone Devil` — **Bone Devil**
- `other:Brass Dragon Wyrmling` — **Brass Dragon Wyrmling**
- `other:Bronze Dragon Wyrmling` — **Bronze Dragon Wyrmling**
- `other:Brown Bear` — **Brown Bear**
- `other:Bugbear Stalker` — **Bugbear Stalker**
- `other:Bugbear Warrior` — **Bugbear Warrior**
- `other:Bulette` — **Bulette**
- `other:Camel` — **Camel**
- `other:Cat` — **Cat**
- `other:Centaur Trooper` — **Centaur Trooper**
- `other:Chain Devil` — **Chain Devil**
- `other:Chimera` — **Chimera**
- `other:Chuul` — **Chuul**
- `other:Clay Golem` — **Clay Golem**
- `other:Cloaker` — **Cloaker**
- `other:Cloud Giant` — **Cloud Giant**
- `other:Cockatrice` — **Cockatrice**
- `other:Commoner` — **Commoner**
- `other:Constrictor Snake` — **Constrictor Snake**
- `other:Copper Dragon Wyrmling` — **Copper Dragon Wyrmling**
- `other:Couatl` — **Couatl**
- `other:Crab` — **Crab**
- `other:Crocodile` — **Crocodile**
- `other:Cultist` — **Cultist**
- `other:Cultist Fanatic` — **Cultist Fanatic**
- `other:Darkmantle` — **Darkmantle**
- `other:Death Dog` — **Death Dog**
- `other:Deer` — **Deer**
- `other:Deva` — **Deva**
- `other:Dire Wolf` — **Dire Wolf**
- `other:Djinni` — **Djinni**
- `other:Doppelganger` — **Doppelganger**
- `other:Draft Horse` — **Draft Horse**
- `other:Dragon Turtle` — **Dragon Turtle**
- `other:Dretch` — **Dretch**
- `other:Drider` — **Drider**
- `other:Druid` — **Druid**
- `other:Dryad` — **Dryad**
- `other:Dust Mephit` — **Dust Mephit**
- `other:Eagle` — **Eagle**
- `other:Earth Elemental` — **Earth Elemental**
- `other:Efreeti` — **Efreeti**
- `other:Elephant` — **Elephant**
- `other:Elk` — **Elk**
- `other:Erinyes` — **Erinyes**
- `other:Ettercap` — **Ettercap**
- `other:Ettin` — **Ettin**
- `other:Fire Elemental` — **Fire Elemental**
- `other:Fire Giant` — **Fire Giant**
- `other:Flesh Golem` — **Flesh Golem**
- `other:Flying Snake` — **Flying Snake**
- `other:Frog` — **Frog**
- `other:Frost Giant` — **Frost Giant**
- `other:Gargoyle` — **Gargoyle**
- `other:Gelatinous Cube` — **Gelatinous Cube**
- `other:Ghast` — **Ghast**
- `other:Ghost` — **Ghost**
- `other:Ghoul` — **Ghoul**
- `other:Giant Ape` — **Giant Ape**
- `other:Giant Badger` — **Giant Badger**
- `other:Giant Bat` — **Giant Bat**
- `other:Giant Boar` — **Giant Boar**
- `other:Giant Centipede` — **Giant Centipede**
- `other:Giant Constrictor Snake` — **Giant Constrictor Snake**
- `other:Giant Crab` — **Giant Crab**
- `other:Giant Crocodile` — **Giant Crocodile**
- `other:Giant Eagle` — **Giant Eagle**
- `other:Giant Elk` — **Giant Elk**
- `other:Giant Fire Beetle` — **Giant Fire Beetle**
- `other:Giant Frog` — **Giant Frog**
- `other:Giant Goat` — **Giant Goat**
- `other:Giant Hyena` — **Giant Hyena**
- `other:Giant Lizard` — **Giant Lizard**
- `other:Giant Octopus` — **Giant Octopus**
- `other:Giant Owl` — **Giant Owl**
- `other:Giant Rat` — **Giant Rat**
- `other:Giant Scorpion` — **Giant Scorpion**
- `other:Giant Seahorse` — **Giant Seahorse**
- `other:Giant Shark` — **Giant Shark**
- `other:Giant Spider` — **Giant Spider**
- `other:Giant Toad` — **Giant Toad**
- `other:Giant Venomous Snake` — **Giant Venomous Snake**
- `other:Giant Vulture` — **Giant Vulture**
- `other:Giant Wasp` — **Giant Wasp**
- `other:Giant Weasel` — **Giant Weasel**
- `other:Giant Wolf Spider` — **Giant Wolf Spider**
- `other:Gibbering Mouther` — **Gibbering Mouther**
- `other:Glabrezu` — **Glabrezu**
- `other:Gladiator` — **Gladiator**
- `other:Gnoll Warrior` — **Gnoll Warrior**
- `other:Goat` — **Goat**
- `other:Goblin Boss` — **Goblin Boss**
- `other:Goblin Minion` — **Goblin Minion**
- `other:Goblin Warrior` — **Goblin Warrior**
- `other:Gold Dragon Wyrmling` — **Gold Dragon Wyrmling**
- `other:Gorgon` — **Gorgon**
- `other:Gray Ooze` — **Gray Ooze**
- `other:Green Dragon Wyrmling` — **Green Dragon Wyrmling**
- `other:Green Hag` — **Green Hag**
- `other:Grick` — **Grick**
- `other:Griffon` — **Griffon**
- `other:Grimlock` — **Grimlock**
- `other:Guard` — **Guard**
- `other:Guard Captain` — **Guard Captain**
- `other:Guardian Naga` — **Guardian Naga**
- `other:Half-Dragon` — **Half-Dragon**
- `other:Harpy` — **Harpy**
- `other:Hawk` — **Hawk**
- `other:Hell Hound` — **Hell Hound**
- `other:Hezrou` — **Hezrou**
- `other:Hill Giant` — **Hill Giant**
