# Integridade da fonte das criaturas SRD 5.2.1

Base auditada: `a43a7a8312143d86727402d8fdd87dc6eebce6f7`. Fonte primária: [SRD 5.2.1 oficial (PDF)](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf), licença CC-BY-4.0. As páginas abaixo são os números impressos no documento.

Este registro separa restauração textual de validação mecânica. `reviewed` indica que o texto PT-BR foi cotejado com a fonte oficial; não certifica de forma geral as estatísticas nem o funcionamento de uma criatura.

## Campos de sentidos e idiomas restaurados

Os sete campos de sentidos e nove campos de idiomas abaixo estavam cortados no pacote. O valor inglês foi restaurado literalmente conforme o bloco oficial; a tradução PT-BR foi completada e marcada `reviewed`. Cada valor foi comparado com o bloco da criatura na página oficial de [Creature Stat Blocks](https://www.dndbeyond.com/sources/dnd/br-2024/creature-stat-blocks) e com a página impressa correspondente do SRD 5.2.1.

| Criatura | Campo | Página SRD | Linha em Creature Stat Blocks | Texto-fonte restaurado |
|---|---|---:|---:|---|
| Barbed Devil | `rules.senses` | 262 | 682 | Darkvision 120 ft. (unimpeded by magical Darkness); Passive Perception 18 |
| Bearded Devil | `rules.senses` | 262 | 763 | Darkvision 120 ft. (unimpeded by magical Darkness); Passive Perception 10 |
| Bone Devil | `rules.senses` | 267 | 1355 | Darkvision 120 ft. (unimpeded by magical Darkness); Passive Perception 12 |
| Chain Devil | `rules.senses` | 273 | 2099 | Darkvision 120 ft. (unimpeded by magical Darkness); Passive Perception 11 |
| Horned Devil | `rules.senses` | 299 | 5303 | Darkvision 150 ft. (unimpeded by magical Darkness); Passive Perception 13 |
| Imp | `rules.senses` | 301 | 5439 | Darkvision 120 ft. (unimpeded by magical Darkness); Passive Perception 11 |
| Lemure | `rules.senses` | 304 | 5803 | Darkvision 120 ft. (unimpeded by magical Darkness); Passive Perception 10 |
| Blink Dog | `rules.languages` | 266 | 1125 | Blink Dog; understands Elvish and Sylvan but can’t speak them |
| Dretch | `rules.languages` | 281 | 3101 | Abyssal; telepathy 60 ft. (works only with creatures that understand Abyssal) |
| Giant Elk | `rules.languages` | 351 | 11885 | Celestial; understands Common, Elvish, and Sylvan but can’t speak them |
| Giant Owl | `rules.languages` | 352 | 12143 | Celestial; understands Common, Elvish, and Sylvan but can’t speak them |
| Kraken | `rules.languages` | 303 | 5703 | Understands Abyssal, Celestial, Infernal, and Primordial but can’t speak; telepathy 120 ft. |
| Ogre Zombie | `rules.languages` | 344 | 10676 | Understands Common and Giant but can’t speak |
| Otyugh | `rules.languages` | 313 | 6975 | Otyugh; telepathy 120 ft. (doesn’t allow the receiving creature to respond telepathically) |
| Pegasus | `rules.languages` | 313 | 7048 | Understands Celestial, Common, Elvish, and Sylvan but can’t speak |
| Pseudodragon | `rules.languages` | 316 | 7410 | Understands Common and Draconic but can’t speak |

Traduções PT-BR incluem a Percepção Passiva e as restrições completas de comunicação/telepatia. As distâncias mecânicas mantêm a unidade de origem `ft`; a interface existente é responsável pela apresentação convertida.

## Deslocamento restaurado

`other:Werebear.rules.speed` estava cortado após “bear”. A fonte oficial, p. 337 e linha 9922 de Creature Stat Blocks, confirma: `30 ft., 40 ft. (bear form only), Climb 30 ft. (bear form only)`. A tradução registrada é `30 ft., 40 ft. (somente na forma de urso), Escalada 30 ft. (somente na forma de urso)`. Valores e qualificadores de forma foram preservados; não houve conversão numérica.

## Ações truncadas e discrepâncias

Os manifestos dos dois lotes identificaram 150 + 37 = 187 objetos de ação para auditoria. O [manifesto por campo](SRD_5_2_1_CREATURE_ACTION_SOURCE_AUDIT.md) registra cada chave e seu estado. Até esta etapa, 98 ações foram conferidas e restauradas/corrigidas e traduzidas; 54 foram removidas por não constarem no bloco oficial; restam 35 alvos pendentes, sem os marcadores `reviewed`. A restauração textual não certifica outras estatísticas das criaturas.

As ações restauradas ou corrigidas integralmente nas etapas concluídas foram:

| Chave | Texto restaurado e tradução revisada | Referência | Estado |
|---|---|---|---|
| `other:Allosaurus.rules.actions.0` | Bite; ataque +6, alcance 5 ft., 15 (2d10 + 4) perfurante | SRD p. 344, linhas 30663–30665 | Fonte e tradução cotejadas |
| `other:Allosaurus.rules.actions.1` | Claws; ataque +6, alcance 5 ft., 8 (1d8 + 4) cortante; inclui condição Caído e ataque subsequente de Bite | SRD p. 344, linhas 30666–30671 | Fonte e tradução cotejadas |
| `other:Awakened Shrub.rules.actions.0` | Rake; ataque +1, alcance 5 ft., 1 cortante | SRD p. 260, linha 23252 | Fonte e tradução cotejadas |
| `other:Assassin.rules.actions.0` | Shortsword; +7, alcance 5 ft., 7 (1d6 + 4) perfurante + 17 (5d6) veneno, condição Envenenado | SRD p. 260, linhas 23227–23231 | Ação corrigida e tradução cotejada |
| `other:Adult Black Dragon.rules.actions.0` | Rend; +11, 10 ft.; 13 (2d6 + 6) cortante + 4 (1d8) ácido | SRD p. 264; Creature Stat Blocks, linhas 980–985 | Restaurada e traduzida integralmente após cotejo |
| `other:Adult Blue Dragon.rules.actions.0` | Rend; +12, 10 ft.; 16 (2d8 + 7) cortante + 5 (1d10) elétrico | SRD p. 266; Creature Stat Blocks, linhas 1251–1256 | Restaurada e traduzida integralmente após cotejo |
| `other:Adult Brass Dragon.rules.actions.0` | Rend; +11, 10 ft.; 17 (2d10 + 6) cortante + 4 (1d8) fogo | SRD p. 268; Creature Stat Blocks, linhas 1488–1493 | Restaurada e traduzida integralmente após cotejo |
| `other:Adult Bronze Dragon.rules.actions.0` | Rend; +12, 10 ft.; 16 (2d8 + 7) cortante + 5 (1d10) elétrico | SRD p. 270; Creature Stat Blocks, linhas 1691–1696 | Restaurada e traduzida integralmente após cotejo |
| `other:Adult Copper Dragon.rules.actions.0` | Rend; +11, 10 ft.; 17 (2d10 + 6) cortante + 4 (1d8) ácido | SRD p. 276; Creature Stat Blocks, linhas 2566–2571 | Restaurada e traduzida integralmente após cotejo |
| `other:Adult Gold Dragon.rules.actions.0` | Rend; +14, 10 ft.; 17 (2d8 + 8) cortante + 4 (1d8) fogo | SRD p. 291; Creature Stat Blocks, linhas 4291–4296 | Restaurada e traduzida integralmente após cotejo |
| `other:Adult Green Dragon.rules.actions.0` | Rend; +11, 10 ft.; 15 (2d8 + 6) cortante + 7 (2d6) veneno | SRD p. 294; Creature Stat Blocks, linhas 4573–4578 | Restaurada e traduzida integralmente após cotejo |
| `other:Adult Red Dragon.rules.actions.0` | Rend; +14, 10 ft.; 13 (1d10 + 8) cortante + 5 (2d4) fogo | SRD p. 318; Creature Stat Blocks, linhas 7677–7682 | Restaurada e traduzida integralmente após cotejo |
| `other:Adult Silver Dragon.rules.actions.0` | Rend; +13, 10 ft.; 17 (2d8 + 8) cortante + 4 (1d8) frio | SRD p. 324; Creature Stat Blocks, linhas 8413–8418 | Restaurada e traduzida integralmente após cotejo |
| `other:Adult White Dragon.rules.actions.0` | Rend; +11, 10 ft.; 13 (2d6 + 6) cortante + 4 (1d8) frio | SRD p. 340; Creature Stat Blocks, linhas 10253–10258 | Restaurada e traduzida integralmente após cotejo |
| `other:Ancient Black Dragon.rules.actions.0` | Rend; +15, 15 ft.; 17 (2d8 + 8) cortante + 9 (2d8) ácido | SRD p. 265; Creature Stat Blocks, bloco Ancient Black Dragon | Restaurada e traduzida integralmente após cotejo |
| `other:Ancient Blue Dragon.rules.actions.0` | Rend; +16, 15 ft.; 18 (2d8 + 9) cortante + 11 (2d10) elétrico | SRD p. 267; Creature Stat Blocks, bloco Ancient Blue Dragon | Restaurada e traduzida integralmente após cotejo |
| `other:Ancient Brass Dragon.rules.actions.0` | Rend; +14, 15 ft.; 19 (2d10 + 8) cortante + 7 (2d6) fogo | SRD p. 269; Creature Stat Blocks, bloco Ancient Brass Dragon | Restaurada e traduzida integralmente após cotejo |
| `other:Ancient Bronze Dragon.rules.actions.0` | Rend; +16, 15 ft.; 18 (2d8 + 9) cortante + 9 (2d8) elétrico | SRD p. 271; Creature Stat Blocks, bloco Ancient Bronze Dragon | Restaurada e traduzida integralmente após cotejo |
| `other:Ancient Copper Dragon.rules.actions.0` | Rend; +15, 15 ft.; 19 (2d10 + 8) cortante + 9 (2d8) ácido | SRD p. 277; Creature Stat Blocks, bloco Ancient Copper Dragon | Restaurada e traduzida integralmente após cotejo |
| `other:Ancient Green Dragon.rules.actions.0` | Rend; +15, 15 ft.; 17 (2d8 + 8) cortante + 10 (3d6) veneno | SRD p. 294; Creature Stat Blocks, bloco Ancient Green Dragon | Restaurada e traduzida integralmente após cotejo |
| `other:Ancient White Dragon.rules.actions.0` | Rend; +14, 15 ft.; 17 (2d8 + 8) cortante + 7 (2d6) frio | SRD p. 341; Creature Stat Blocks, bloco Ancient White Dragon | Restaurada e traduzida integralmente após cotejo |
| `other:Animated Rug of Smothering.rules.actions.0` | Smother; +5, alcance 5 ft.; 10 (2d6 + 3) contundente; agarrão, condições Cego/Impedido, sufocamento, dano por turno, limite de uma criatura e redução/repasse de dano enquanto agarrando | SRD p. 259, linhas 23171–23179; Creature Stat Blocks, linhas 379–381 | Texto integral cotejado e restaurado; fonte mecânica não validada além do ataque |
| `other:Ankylosaurus.rules.actions.0` | Tail; +6, alcance 10 ft.; 9 (1d10 + 4) contundente; Caído para alvo Enorme ou menor | SRD p. 344, linhas 30684–30687; Creature Stat Blocks, linhas 10403–10406 | Texto integral cotejado e restaurado |
| `other:Archelon.rules.actions.0` | Bite; +6, alcance 5 ft.; 14 (3d6 + 4) perfurante | SRD p. 344, linhas 30720–30723; Creature Stat Blocks, linhas 10475–10478 | Ação restaurada e tradução cotejada; bônus de ataque corrigido de +2 para +6 |
| `other:Awakened Tree.rules.actions.0` | Slam; +6, alcance 10 ft.; 14 (3d6 + 4) contundente | SRD p. 260, linhas 23253–23268; Creature Stat Blocks, linhas 530–532 | Texto integral cotejado e restaurado |
| `other:Baboon.rules.actions.0` | Bite; +1, alcance 5 ft.; 1 (1d4 − 1) perfurante | SRD p. 345, linhas 30740–30742; Creature Stat Blocks, linhas 10509–10511 | Ação restaurada e tradução cotejada; bônus de ataque corrigido de +4 para +1 |
| `other:Badger.rules.actions.0` | Bite; +2, alcance 5 ft.; 1 perfurante | SRD p. 345, linhas 30756–30758; Creature Stat Blocks, linhas 10543–10545 | Ação restaurada e tradução cotejada; bônus de ataque corrigido de +4 para +2 |
| `other:Balor.rules.actions.0` | Flame Whip; +14, alcance 30 ft.; 18 (3d6 + 8) energia + 17 (5d6) fogo; puxão até 25 ft. e Caído | SRD p. 261, linhas 23335–23342; Creature Stat Blocks, linhas 642–645 | Texto integral cotejado e restaurado |
| `other:Balor.rules.actions.1` | Lightning Blade; +14, alcance 10 ft.; 21 (3d8 + 8) energia + 22 (4d10) elétrico; impede Reações até o início do próximo turno do balor | SRD p. 261, linhas 23343–23345; Creature Stat Blocks, linhas 646–647 | Texto integral cotejado e restaurado |
| `other:Bandit.rules.actions.0` | Scimitar; +3, alcance 5 ft.; 4 (1d6 + 1) cortante | SRD p. 261, linhas 23363–23365; Creature Stat Blocks, linhas 681–684 | Ação restaurada e tradução cotejada; bônus de ataque corrigido de +5 para +3 |
| `other:Bandit Captain.rules.actions.0` | Scimitar; +5, alcance 5 ft.; 6 (1d6 + 3) cortante | SRD p. 261, linhas 23381–23384; Creature Stat Blocks, linhas 716–720 | Texto integral cotejado e restaurado |

| `other:Barbed Devil.rules.actions.0` | Claws; +6, alcance 5 ft.; 10 (2d6 + 3) perfurante; agarrão de alvo Grande ou menor, CD 13, pelas duas garras | SRD p. 262, linhas 23417–23423; Creature Stat Blocks, linhas 695–698 | Texto integral restaurado e cotejado |
| `other:Barbed Devil.rules.actions.1` | Tail; +6, alcance 10 ft.; 14 (2d10 + 3) cortante | SRD p. 262, linhas 23417–23425; Creature Stat Blocks, linhas 695–700 | Texto integral restaurado e cotejado |
| `other:Bat.rules.actions.0` | Bite; +4, alcance 5 ft.; 1 perfurante | SRD p. 345; Creature Stat Blocks, linhas 10928–10930 | Texto integral restaurado e cotejado |
| `other:Bearded Devil.rules.actions.0` | Beard; +5, alcance 5 ft.; 7 (1d8 + 3) perfurante; alvo Envenenado, sem recuperar PV enquanto o veneno durar | SRD p. 262, linhas 23471–23477; Creature Stat Blocks, linhas 773–776 | Texto integral restaurado e cotejado |
| `other:Bearded Devil.rules.actions.1` | Infernal Glaive; +5, alcance 10 ft.; 8 (1d10 + 3) cortante; ferida infernal, teste CD 12, perda de 5 (1d10) PV por turno e condições de encerramento | SRD p. 262, linhas 23471–23486; Creature Stat Blocks, linhas 773–778 | Texto integral restaurado e cotejado |
| `other:Behir.rules.actions.0` | Bite; +10, alcance 10 ft.; 19 (2d12 + 6) perfurante + 11 (2d10) elétrico | SRD p. 263, linhas 23501–23505; Creature Stat Blocks, linhas 810–815 | Texto integral restaurado e cotejado |
| `other:Blue Dragon Wyrmling.rules.actions.0` | Rend; +5, alcance 5 ft.; 8 (1d10 + 3) cortante + 3 (1d6) elétrico | SRD p. 266, linhas 23773–23776; Creature Stat Blocks, linhas 1169–1175 | Texto integral restaurado e cotejado |
| `other:Blue Dragon Wyrmling.rules.actions.1` | Lightning Breath (Recarga 5–6); resistência de Destreza CD 12, linha de 30 ft × 5 ft, 21 (6d6) elétrico; removeu-se bônus de ataque indevido | SRD p. 266, linhas 23773–23779; Creature Stat Blocks, linhas 1169–1175 | A ação duplicada Rend foi corrigida para a ação oficial e cotejada |
| `other:Bone Devil.rules.actions.0` | Claw; +8, alcance 10 ft.; 13 (2d8 + 4) cortante | SRD p. 267, linhas 23908–23912; Creature Stat Blocks, linhas 1367–1370 | Texto integral restaurado e cotejado |
| `other:Bone Devil.rules.actions.1` | Infernal Sting; +8, alcance 10 ft.; 15 (2d10 + 4) perfurante + 18 (4d8) veneno; Envenenado até o início do próximo turno do diabo e não recupera PV enquanto Envenenado | SRD p. 267, linhas 23913–23917; Creature Stat Blocks, linhas 1370–1372 | Fragmento completado a partir da fonte e tradução integral cotejada |
| `other:Brass Dragon Wyrmling.rules.actions.0` | Rend; +4, alcance 5 ft.; 7 (1d10 + 2) cortante | SRD p. 268, linhas 23933–23935; Creature Stat Blocks, linhas 1406–1408 | Fragmento restaurado e tradução integral cotejada |
| `other:Bronze Dragon Wyrmling.rules.actions.0` | Rend; +5, alcance 5 ft.; 8 (1d10 + 3) cortante | SRD p. 269, linhas 24106–24108; Creature Stat Blocks, Bronze Dragon Wyrmling | Fragmento restaurado e tradução integral cotejada |
| `other:Bronze Dragon Wyrmling.rules.actions.1` | Lightning Breath; Recarga 5–6, resistência de Destreza CD 12, linha de 40 × 5 ft., 16 (3d10) elétrico | SRD p. 269, linhas 24109–24110; Creature Stat Blocks, Bronze Dragon Wyrmling | Rend duplicada corrigida para a ação oficial; tradução cotejada |
| `other:Bugbear Warrior.rules.actions.0` | Grab; +4, alcance 10 ft.; 9 (2d6 + 2) contundente; alvo Médio ou menor Agarrado, CD 12 para escapar | SRD p. 272, linhas 24297–24300; Creature Stat Blocks, linhas 1852–1854 | Fragmento restaurado e tradução integral cotejada |
| `other:Bulette.rules.actions.0` | Bite; +7, alcance 5 ft.; 17 (2d12 + 4) perfurante | SRD p. 272, linhas 24318–24321; Creature Stat Blocks, linhas 1982–1986 | Ação-fonte Pike corrigida para Bite e tradução cotejada |
| `other:Cat.rules.actions.0` | Scratch; +4, alcance 5 ft.; 1 cortante | SRD p. 346, linha 30878; Creature Stat Blocks, linhas 11139–11141 | Fragmento restaurado e tradução integral cotejada |
| `other:Centaur Trooper.rules.actions.0` | Pike; +6, alcance 10 ft.; 9 (1d10 + 4) perfurante | SRD p. 271, linhas 24345–24349; Creature Stat Blocks, linhas 2063–2068 | Fragmento restaurado e tradução integral cotejada |
| `other:Chuul.rules.actions.0` | Pincer; +6, alcance 10 ft.; 9 (1d10 + 4) contundente; Agarrado para alvo Grande ou menor, CD 14 para escapar, por uma pinça | SRD p. 273, linhas 24452–24458; Creature Stat Blocks, linhas 2197–2201 | Fragmento restaurado e tradução integral cotejada |
| `other:Clay Golem.rules.actions.0` | Slam; +9, alcance 5 ft.; 10 (1d10 + 5) contundente + 6 (1d12) ácido; reduz o máximo de PV pelo dano ácido sofrido | SRD p. 273, linhas 24495–24500; Creature Stat Blocks, linhas 2242–2246 | Fragmento restaurado e tradução integral cotejada |
| `other:Cloaker.rules.actions.0` | Attach; +6, alcance 5 ft.; 13 (3d6 + 3) perfurante; fixação, Cego, redução/repasse de dano e remoção por movimento ou teste de Atletismo CD 14 | SRD p. 274, linhas 24522–24534; Creature Stat Blocks, linhas 2288–2290 | Fragmento restaurado e descrição integral traduzida |
| `other:Cloaker.rules.actions.1` | Tail; +6, alcance 10 ft.; 8 (1d10 + 3) cortante | SRD p. 274, linhas 24535–24536; Creature Stat Blocks, linha 2292 | Fragmento restaurado e tradução integral cotejada |
As ações foram cotejadas diretamente com os blocos oficiais, não reconstruídas por inferência a partir dos fragmentos do pacote. Os campos `name`, `damage`, `range` e `description` têm proveniência `reviewed` somente nos registros restaurados/corrigidos listados acima. Cinco bônus de ataque foram corrigidos porque os blocos oficiais confirmam valores diferentes do pacote; a revisão destes ataques não certifica estatísticas gerais das criaturas.

### Ações verificadas neste lote

| Chave | Conteúdo cotejado | Referência oficial |
|---|---|---|
| `other:Constrictor Snake.rules.actions.0` | Bite; +4, 5 ft.; 6 (1d8 + 2) perfurante | SRD p. 346, linhas 30891–30893; Creature Stat Blocks, linhas 11173–11174 |
| `other:Constrictor Snake.rules.actions.1` | Constrict; salvaguarda de Força CD 12; falha causa 7 (3d4) contundente e Agarrado, CD 12 para escapar; sem bônus de ataque | SRD p. 346, linhas 30894–30897; Creature Stat Blocks, linhas 11175–11176 |
| `other:Copper Dragon Wyrmling.rules.actions.0` | Rend; +4, 5 ft.; 7 (1d10 + 2) cortante | SRD p. 275, linhas 24638–24640; Creature Stat Blocks, linhas 2484–2486 |
| `other:Crab.rules.actions.0` | Claw; +2, 5 ft.; 1 contundente | SRD p. 347, linhas 30912–30913; Creature Stat Blocks, linhas 11211–11213 |
| `other:Cultist Fanatic.rules.actions.0` | Pact Blade; +4, 5 ft.; 6 (1d8 + 2) cortante + 7 (2d6) necrótico | SRD p. 278, linhas 24887–24889; Creature Stat Blocks, linhas 2794–2797 |
| `other:Darkmantle.rules.actions.0` | Crush; +5, 5 ft.; 6 (1d6 + 3) contundente; efeitos de fixação, cegueira, sufocamento e desprendimento | SRD p. 278, linhas 24913–24925; Creature Stat Blocks, linhas 2840–2844 |
| `other:Death Dog.rules.actions.0` | Bite; +4, 5 ft.; 4 (1d4 + 2) perfurante; salvaguarda CD 12, veneno, descanso longo, repetição após 24 horas e redução do máximo de PV | SRD p. 279, linhas 24946–24955; Creature Stat Blocks, linhas 2878–2882 |
| `other:Deva.rules.actions.0` | Holy Mace; +8, 5 ft.; 7 (1d6 + 4) contundente + 18 (4d8) radiante | SRD p. 279, linhas 24978–24981; Creature Stat Blocks, linhas 2922–2925 |
| `other:Djinni.rules.actions.0` | Storm Blade; +9, 5 ft.; 12 (2d6 + 5) cortante + 7 (2d6) elétrico | SRD p. 280, linhas 25020–25023; Creature Stat Blocks, linhas 2972–2974 |
| `other:Djinni.rules.actions.1` | Storm Bolt; +9, 120 ft.; 13 (3d8) trovejante; alvo Grande ou menor fica Caído | SRD p. 280, linhas 25024–25027; Creature Stat Blocks, linhas 2975–2977 |
| `other:Draft Horse.rules.actions.0` | Hooves; +6, 5 ft.; 6 (1d4 + 4) contundente | SRD p. 347, linhas 30984–30986; Creature Stat Blocks, linhas 11354–11356 |
| `other:Dragon Turtle.rules.actions.1` | Tail; +13, 15 ft.; 18 (2d10 + 7) contundente; alvo Imenso ou menor fica Caído | SRD p. 281, linhas 25098–25107; Creature Stat Blocks, linhas 3065–3072 |

Ataque, alcance, dano e texto completo foram verificados em cada registro acima. Essa conferência é textual e específica ao campo; não equivale a uma validação mecânica geral do bloco da criatura.
Outras dezenove ações foram verificadas como indevidas e removidas:

| Chave | Evidência no SRD 5.2.1 | Estado |
|---|---|---|
| `other:Allosaurus.rules.actions.2` | p. 344, linhas 30663–30671: lista Bite e Claws, sem Tail | Removida |
| `other:Animated Armor.rules.actions.2` | p. 259, linhas 23138–23141: lista Slam, sem Smother | Removida |
| `other:Animated Flying Sword.rules.actions.1` | p. 259, linhas 23155–23157: lista Slash, sem Smother | Removida |
| `other:Awakened Shrub.rules.actions.1` | p. 260, linhas 23251–23252: Rake é a única ação antes do bloco Awakened Tree | Removida |
| `other:Blink Dog.rules.actions.1` | p. 266, linhas 23752–23757: Bite e Teleport bônus, sem Rend | Removida |
| `other:Bone Devil.rules.actions.2` | p. 267, linhas 23908–23917: Claw e Infernal Sting, sem Rend | Removida |
| `other:Brown Bear.rules.actions.2` | p. 346, linhas 30841–30847: Bite e Claw, sem Scratch | Removida |
| `other:Bugbear Stalker.rules.actions.0` | p. 271, linhas 24269–24280: ações Multiattack, Javelin e Morningstar; Quick Grapple é ação bônus, sem Grab | Removida |
| `other:Camel.rules.actions.1` | p. 346, linhas 30848–30861: apenas Bite, sem Scratch | Removida |
| `other:Cat.rules.actions.2` | p. 346, linhas 30873–30879: apenas Scratch, sem Claw | Removida |
| `other:Chimera.rules.actions.0` | p. 273, linhas 24418–24431: Multiattack, Bite, Claw, Ram e Fire Breath; sem Pincer | Removida |
| `other:Commoner.rules.actions.1` | p. 275, linhas 24620–24622: apenas Club, sem Rend | Removida |

As remoções confirmadas foram:

| Chave | Achado oficial | Referência | Estado |
|---|---|---|---|
| `other:Basilisk.rules.actions.1` | O bloco oficial contém Bite (+5, alcance 5 ft., 10 (2d6 + 3) perfurante + 7 (2d6) veneno) e Petrifying Gaze em Bonus Actions. Não existe Beard. | Creature Stat Blocks, Basilisk, linhas 732–736; SRD 5.2.1, p. 262 | Verificado; bloco divergente removido |
| `other:Venomous Snake.rules.actions.2` | A única ação é Bite (+4, alcance 5 ft., 4 (1d4 + 2) perfurante + 3 (1d6) veneno). Não existe Hooves. | Creature Stat Blocks, Venomous Snake, linhas 13986–13987; SRD 5.2.1, p. 363 | Verificado; bloco divergente removido |
| `other:Vulture.rules.actions.1` | A única ação é Beak (+2, alcance 5 ft., 2 (1d4) perfurante). Não existe Hooves. | Creature Stat Blocks, Vulture, linhas 14022–14024; SRD 5.2.1, p. 363 | Verificado; bloco divergente removido |
| `other:Crab.rules.actions.1` | Crab tem somente Claw; Bite não consta. | Creature Stat Blocks, Crab, linhas 11211–11213; SRD p. 347, linhas 30912–30913 | Verificado; alvo removido |
| `other:Cultist.rules.actions.1` | Cultist tem somente Ritual Sickle; Pact Blade não consta. | Creature Stat Blocks, linhas 2760–2761; SRD p. 278, linhas 24871–24873 | Verificado; alvo removido |
| `other:Cultist.rules.actions.2` | Cultist tem somente Ritual Sickle; Crush não consta. | Creature Stat Blocks, linhas 2760–2761; SRD p. 278, linhas 24871–24873 | Verificado; alvo removido |
| `other:Cultist Fanatic.rules.actions.1` | Cultist Fanatic tem somente Pact Blade; Crush não consta. | Creature Stat Blocks, linhas 2794–2797; SRD p. 278, linhas 24887–24889 | Verificado; alvo removido |
| `other:Deer.rules.actions.2` | Deer tem somente Ram; Hooves não consta. | Creature Stat Blocks, linhas 11285–11287; SRD p. 347, linhas 30950–30952 | Verificado; alvo removido |
| `other:Dire Wolf.rules.actions.1` | Dire Wolf tem somente Bite; Hooves não consta. | Creature Stat Blocks, linhas 11322–11324; SRD p. 347, linhas 30970–30972 | Verificado; alvo removido |
| `other:Dire Wolf.rules.actions.2` | Dire Wolf tem somente Bite; Talons não consta. | Creature Stat Blocks, linhas 11322–11324; SRD p. 347, linhas 30970–30972 | Verificado; alvo removido |
| `other:Draft Horse.rules.actions.1` | Draft Horse tem somente Hooves; Talons não consta. | Creature Stat Blocks, linhas 11354–11356; SRD p. 347, linhas 30984–30986 | Verificado; alvo removido |
| `other:Draft Horse.rules.actions.2` | Draft Horse tem somente Hooves; Gore não consta. | Creature Stat Blocks, linhas 11354–11356; SRD p. 347, linhas 30984–30986 | Verificado; alvo removido |
| `other:Crab.rules.actions` (fora dos alvos originais) | O bloco oficial contém somente Claw; a ação adicional Ram foi removida. | Creature Stat Blocks, Crab, linhas 11211–11213; SRD 5.2.1, p. 347 | Divergência confirmada e removida; não altera os 187 alvos |
| `other:Deer.rules.actions` (fora dos alvos originais) | O bloco oficial contém somente Ram; a ação adicional Bite foi removida. | Creature Stat Blocks, Deer, linhas 11285–11287; SRD 5.2.1, p. 347 | Divergência confirmada e removida; não altera os 187 alvos |

As linhas oficiais também confirmam alcance, ataque, dano e texto integral da ação válida correspondente. Isso valida a associação e a restauração textual desses alvos, não as demais estatísticas das criaturas. Naquele ponto histórico da auditoria, 39 alvos haviam sido removidos e 67 permaneciam pendentes. Antes do lote atual, 48 haviam sido removidos e 51 permaneciam pendentes; agora, 54 foram removidos e 35 seguem pendentes. Os campos pendentes continuam preservados e sem marcador `reviewed` até a conferência individual de nome, texto completo, alcance e dano.

## Lote anterior: Druid–Frog

Foram cotejados os 16 alvos pendentes seguintes na ordem do manifesto. Nove blocos válidos foram restaurados/traduzidos e os campos localizados receberam `reviewed`; sete ações não pertenciam à criatura indicada e foram removidas junto com suas chaves localizadas. A apresentação mantém os tokens `ft` nas traduções para que `formatDistance` cuide da exibição métrica; os valores-fonte permanecem nas unidades originais.

| Chave | Conferência | Referência oficial |
|---|---|---|
| `other:Druid.rules.actions.0` | Vine Staff; +5, 5 ft.; 7 (1d8 + 3) contundente + 2 (1d4) veneno | Creature Stat Blocks, Druid, linhas 3189–3195 |
| `other:Eagle.rules.actions.0` | Talons; +4, 5 feet; 4 (1d4 + 2) cortante | Creature Stat Blocks, Eagle, linhas 11388–11390 |
| `other:Earth Elemental.rules.actions.0` | Slam; +8, 10 ft.; 14 (2d8 + 5) contundente | Creature Stat Blocks, Earth Elemental, linhas 3291–3295 |
| `other:Elephant.rules.actions.0` | Gore; +8, 5 ft.; 15 (2d8 + 6) perfurante; condição Caído após deslocamento de 20+ ft. | Creature Stat Blocks, Elephant, linhas 11419–11422 |
| `other:Elk.rules.actions.0` | Ram; +5, 5 ft.; 6 (1d6 + 3) contundente; dano adicional e Caído após deslocamento de 20+ ft. | Creature Stat Blocks, Elk, linhas 11458–11459 |
| `other:Erinyes.rules.actions.0` | Withering Sword; +8, 5 ft.; 13 (2d8 + 4) cortante + 11 (2d10) necrótico | Creature Stat Blocks, Erinyes, linhas 3386–3389 |
| `other:Fire Elemental.rules.actions.0` | Burn; +6, 5 ft.; 10 (2d6 + 3) fogo; criaturas ou objetos inflamáveis começam a queimar | Creature Stat Blocks, Fire Elemental, linhas 3520–3524 |
| `other:Flying Snake.rules.actions.0` | Bite; bônus corrigido de +3 para +4; 5 ft.; 1 perfurante + 5 (2d4) veneno | Creature Stat Blocks, Flying Snake, linhas 11492–11495 |
| `other:Frog.rules.actions.0` | Bite; +3, 5 ft.; 1 perfurante | Creature Stat Blocks, Frog, linhas 11531–11533 |

Foram removidos após confirmação explícita de que não constam nos blocos indicados: `Eagle.rules.actions.1` (Gore) e `.2` (Ram), `Elephant.rules.actions.1` (Ram) e `.2` (Bite), `Elk.rules.actions.1` (Bite), `Flying Snake.rules.actions.1` (Fist) e `Frog.rules.actions.1` (Fist). Referências: Eagle, linhas 11388–11390; Elephant, 11419–11426; Elk, 11458–11460; Flying Snake, 11492–11495; Frog, 11531–11534. A ausência das ações extras foi cotejada no bloco completo da criatura; não foram inferidas a partir de fragmentos.

## Apresentação e catálogo compartilhado

O compêndio usa `translatedCompendiumText` para os campos aninhados de regras. A ficha/bestiário usa `localizedMonsterField` para `pt-BR.rules.*` e mantém o inglês como fallback quando uma chave localizada não existe. O importador do catálogo compartilhado aplica campos com proveniência `reviewed`, substitui valores existentes com proveniência `ai` ou ausente e preserva fontes protegidas (`manual`, `official`, `reviewed`, `human`, `user`). A rotina é idempotente ao reimportar os mesmos valores. Esta revisão foi somente de código e pacote: nenhum banco foi acessado ou sincronizado.

## Lote seguinte: Frost Giant–Giant Eagle

Foram cotejados os 16 alvos pendentes seguintes na ordem do manifesto. Oito ações válidas foram restauradas/traduzidas, com `.source=reviewed` nos campos textuais conferidos, e oito blocos ausentes do bloco oficial foram removidos junto com suas chaves localizadas.

| Chave | Conferência | Referência oficial |
|---|---|---|
| `other:Frost Giant.rules.actions.1` | Great Bow; +9, alcance 150/600 ft.; 17 (2d10 + 6) perfurante + 7 (2d6) frio; redução de 10 ft. no Deslocamento até o fim do próximo turno | Creature Stat Blocks, Frost Giant, linhas 3644–3648 |
| `other:Ghast.rules.actions.1` | Claw; +5, 5 ft.; 10 (2d6 + 3) cortante; salvaguarda de Constituição CD 10 e Paralisado até o fim do próximo turno em caso de falha | Creature Stat Blocks, Ghast, linha 3777 |
| `other:Ghoul.rules.actions.1` | Claw; +4, 5 ft.; 4 (1d4 + 2) cortante; a condição exclui Mortos-vivos e elfos; salvaguarda de Constituição CD 10 | Creature Stat Blocks, Ghoul, linha 3863 |
| `other:Giant Ape.rules.actions.0` | Fist; +9, 10 ft.; 22 (3d10 + 6) contundente | Creature Stat Blocks, Giant Ape, linhas 11565–11570 |
| `other:Giant Badger.rules.actions.1` | Gore removida: o bloco lista somente Bite | Creature Stat Blocks, Giant Badger, linhas 11607–11608 |
| `other:Giant Bat.rules.actions.1` | Gore removida: o bloco lista somente Bite | Creature Stat Blocks, Giant Bat, linhas 11638–11639 |
| `other:Giant Boar.rules.actions.0` | Gore; +5, 5 ft.; 10 (2d6 + 3) perfurante; dano extra 7 (2d6) e Caído após deslocamento em linha reta | Creature Stat Blocks, Giant Boar, linhas 11672–11674 |
| `other:Giant Boar.rules.actions.2` | Bite removida: o bloco lista Gore como ação | Creature Stat Blocks, Giant Boar, linhas 11672–11674 |
| `other:Giant Centipede.rules.actions.1` | Bite duplicada removida: o bloco tem uma Bite, +4, 5 ft., 4 (1d4 + 2) perfurante e condição Envenenado | Creature Stat Blocks, Giant Centipede, linhas 11704–11705 |
| `other:Giant Constrictor Snake.rules.actions.0` | Bite; +6, 10 ft.; 11 (2d6 + 4) perfurante | Creature Stat Blocks, Giant Constrictor Snake, linhas 11737–11742 |
| `other:Giant Constrictor Snake.rules.actions.2` | Bite adicional removida: as ações são Bite e Constrict; a segunda é salvaguarda de Força CD 14, 10 ft., 13 (2d8 + 4) contundente e Agarrado | Creature Stat Blocks, Giant Constrictor Snake, linhas 11737–11742 |
| `other:Giant Crab.rules.actions.1` | Bite removida: a única ação é Claw | Creature Stat Blocks, Giant Crab, linhas 11777–11779 |
| `other:Giant Crab.rules.actions.2` | Tail removida: a única ação é Claw | Creature Stat Blocks, Giant Crab, linhas 11777–11779 |
| `other:Giant Crocodile.rules.actions.0` | Bite; +8, 5 ft.; 21 (3d10 + 5) perfurante; Agarrado (CD 15), Restringido e imunidade a alvo da Tail enquanto agarrado | Creature Stat Blocks, Giant Crocodile, linhas 11814–11818 |
| `other:Giant Crocodile.rules.actions.1` | Tail; +8, 10 ft.; 18 (3d8 + 5) contundente; alvo Grande ou menor fica Caído | Creature Stat Blocks, Giant Crocodile, linhas 11816–11819 |
| `other:Giant Eagle.rules.actions.1` | Ram removida: Multiattack usa Rend; Ram não consta | Creature Stat Blocks, Giant Eagle, linhas 11852–11856 |

Ao remover alvos que ocupavam posições anteriores a ações preservadas, os índices de localização foram reindexados para continuarem associados à ação correta (Giant Centipede). Outras ações não listadas como alvos foram mantidas intactas. A conferência do bloco oficial também revelou divergências em ações fora deste lote — Giant Ape/Bite, Giant Boar/Bite, Giant Centipede/Claw, Giant Constrictor Snake/Claw, Giant Crocodile/Rend e dano radiante adicional de Giant Eagle/Rend; não foram alteradas e ficam fora da contagem desta auditoria.


## Lote anterior: Giant Elk–Goat

Foram processados os 16 alvos pendentes seguintes em ordem do manifesto: sete ações restauradas/corrigidas e nove removidas. As ações válidas receberam tradução integral e proveniência .source=reviewed somente nos campos conferidos. Fonte primária: [SRD 5.2.1 oficial, PDF](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf); as páginas são as impressas no documento e os números de linha identificam o texto extraído.

| Alvo | Resultado verificado | Referência SRD 5.2.1 |
|---|---|---|
| Giant Elk .rules.actions.0 | Ram; +6, 10 ft.; 11 (2d6 + 4) contundente + 5 (2d4) radiante; investida causa dano extra e Caído | p. 350, linhas 31262–31268 |
| Giant Octopus .rules.actions.1 | Talons removida; Tentacles é ação e Ink Cloud é Reação | p. 352, linhas 31386–31394 |
| Giant Owl .rules.actions.0 | Talons; +4, 5 ft.; 7 (1d10 + 2) cortante | p. 352, linhas 31412–31419 |
| Giant Owl .rules.actions.1 | Bite removida; não aparece no bloco | p. 352, linhas 31412–31419 |
| Giant Rat .rules.actions.0 | Bite; +5, 5 feet; 5 (1d4 + 3) perfurante | p. 353, linhas 31437–31439 |
| Giant Rat .rules.actions.3 | Ram removida; Bite é a única ação | p. 353, linhas 31437–31439 |
| Giant Scorpion .rules.actions.2 | Ram removida; bloco lista Multiattack, Claw e Sting | p. 353, linhas 31451–31459 |
| Giant Seahorse .rules.actions.0 | Ram; +4, 5 ft.; 9 (2d6 + 2), ou 11 (2d8 + 2) contundente após movimento reto | p. 353, linhas 31474–31481 |
| Giant Venomous Snake .rules.actions.1 | Gouge removida; Bite é a única ação | p. 354, linhas 31569–31571 |
| Giant Vulture .rules.actions.0 | Gouge; +4, 5 ft.; 9 (2d6 + 2) perfurante e Envenenado até o fim do próximo turno | p. 354, linhas 31589–31592 |
| Giant Weasel .rules.actions.1 | Ram removida; Bite é a única ação | p. 355, linhas 31621–31623 |
| Giant Wolf Spider .rules.actions.1 | Ram removida; Bite é a única ação | p. 355, linhas 31641–31643 |
| Giant Wolf Spider .rules.actions.2 | Talons removida; Bite é a única ação | p. 355, linhas 31641–31643 |
| Glabrezu .rules.actions.0 | Pincer; +9, 10 ft.; 16 (2d10 + 5) cortante; Agarrado (CD 15) em alvo Médio ou menor | p. 289, linhas 25800–25808 |
| Gnoll Warrior .rules.actions.2 | Scimitar removida; ações Rend e Bone Bow; Rampage é Ação Bônus | p. 289, linhas 25851–25859 |
| Goat .rules.actions.0 | Ram; +2, 5 ft.; 1 contundente, ou 2 (1d4) após movimento reto | p. 355, linhas 31656–31658 |

A tradução de “Gouge” como “Golpe de Bico” é uma escolha editorial contextual, não uma tradução oficial. Remoções em índices intermediários preservaram o conteúdo não-alvo e reindexaram apenas as chaves localizadas necessárias. A conferência é textual e específica aos alvos; não certifica outras estatísticas.

## Lote atual: Goat–Hawk

Foram cotejados os 16 alvos pendentes seguintes em ordem do manifesto. Dez ações válidas foram restauradas/traduzidas e seis ações ausentes dos blocos oficiais foram removidas. Os campos localizados das dez ações válidas receberam `reviewed` somente após conferência. Esta auditoria textual não certifica as demais estatísticas das criaturas.

| Alvo | Resultado | Referência SRD 5.2.1 |
|---|---|---|
| Goat `.rules.actions.1` | Talons removida; somente Ram está listada | p. 355, linhas 31656–31658 |
| Goblin Boss `.rules.actions.0` | Scimitar; +4, 5 ft.; 5 (1d6 + 2) cortante + 2 (1d4) com Vantagem | p. 290, linhas 25916–25923 |
| Goblin Boss `.rules.actions.1` | Shortbow; +4, 80/320 ft.; 5 (1d6 + 2) perfurante + 2 (1d4) com Vantagem | p. 290, linhas 25916–25923 |
| Goblin Boss `.rules.actions.2` | Rend removida; ações Multiattack, Scimitar e Shortbow | p. 290, linhas 25916–25923 |
| Goblin Minion `.rules.actions.1` | Shortbow removido; somente Dagger está listada | p. 290, linhas 25874–25876 |
| Goblin Warrior `.rules.actions.0` | Scimitar; +4, 5 ft.; 5 (1d6 + 2) cortante + 2 (1d4) com Vantagem | p. 290, linhas 25893–25900 |
| Goblin Warrior `.rules.actions.1` | Shortbow; +4, 80/320 ft.; 5 (1d6 + 2) perfurante + 2 (1d4) com Vantagem | p. 290, linhas 25893–25900 |
| Gold Dragon Wyrmling `.rules.actions.0` | Rend; +6, 5 ft.; 9 (1d10 + 4) cortante | p. 290, linhas 25949–25952 |
| Gorgon `.rules.actions.0` | Gore; +8, 5 ft.; 18 (2d12 + 5) perfurante; investida pode deixar alvo Grande ou menor Caído | p. 292, linhas 26130–26135 |
| Green Dragon Wyrmling `.rules.actions.0` | Rend; +4, 5 ft.; 7 (1d10 + 2) cortante + 3 (1d6) venenoso | p. 293, linhas 26200–26203 |
| Grick `.rules.actions.3` | Bone Cudgel removida; ações Multiattack, Beak e Tentacles | p. 295, linhas 26375–26383 |
| Griffon `.rules.actions.1` | Bone Cudgel removida; ações Multiattack e Rend | p. 295, linhas 26397–26402 |
| Grimlock `.rules.actions.0` | Bone Cudgel; +5, 5 ft.; 6 (1d6 + 3) contundente + 2 (1d4) psíquico | p. 296, linhas 26416–26418 |
| Grimlock `.rules.actions.1` | Bite removida; Bone Cudgel é a única ação | p. 296, linhas 26416–26418 |
| Guardian Naga `.rules.actions.0` | Bite; +8, 10 ft.; 17 (2d12 + 4) perfurante + 22 (4d10) venenoso | p. 296, linhas 26438–26442 |
| Hawk `.rules.actions.0` | Talons; +5, 5 ft.; 1 cortante | p. 355, linhas 31659–31672 |

O campo `Goblin Minion.rules.actions.0` (Scimitar) também diverge do bloco oficial, que lista Dagger, mas não fazia parte dos 16 alvos e foi preservado sem revisão. Não alterei ações ou estatísticas fora dos alvos selecionados.

## Pendências

- Cotejar individualmente os 35 objetos de ação ainda pendentes no manifesto com seus blocos oficiais; até isso ocorrer, suas fontes e traduções permanecem preservadas e não são consideradas completas nem mecanicamente validadas.
- Não considerar `reviewed` validação mecânica abrangente.
- Não foi realizada sincronização nem integração com banco; sua política foi verificada no código e nos testes unitários existentes.
