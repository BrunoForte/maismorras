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

Os manifestos dos dois lotes identificaram 150 + 37 = 187 objetos de ação para auditoria. O [manifesto por campo](SRD_5_2_1_CREATURE_ACTION_SOURCE_AUDIT.md) registra cada chave e seu estado. Até esta etapa, 40 ações foram conferidas e restauradas/corrigidas e traduzidas (quatro verificações iniciais, 17 ações de dragões e 19 ações dos lotes alfabéticos A–C); dez ações foram removidas por não constarem no bloco oficial; restam 137 alvos pendentes, sem os marcadores `reviewed`. A restauração textual não certifica outras estatísticas das criaturas.

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
As ações foram cotejadas diretamente com o texto do PDF oficial, não reconstruídas a partir dos fragmentos do pacote. Os campos `name`, `damage`, `range` e `description` têm proveniência `reviewed` somente nos 40 registros restaurados/corrigidos listados acima. Quatro bônus de ataque foram corrigidos porque os blocos oficiais confirmam valores diferentes do pacote; a revisão destes ataques não certifica estatísticas gerais das criaturas.
Outras sete ações foram verificadas como indevidas e removidas:

| Chave | Evidência no SRD 5.2.1 | Estado |
|---|---|---|
| `other:Allosaurus.rules.actions.2` | p. 344, linhas 30663–30671: lista Bite e Claws, sem Tail | Removida |
| `other:Animated Armor.rules.actions.2` | p. 259, linhas 23138–23141: lista Slam, sem Smother | Removida |
| `other:Animated Flying Sword.rules.actions.1` | p. 259, linhas 23155–23157: lista Slash, sem Smother | Removida |
| `other:Awakened Shrub.rules.actions.1` | p. 260, linhas 23251–23252: Rake é a única ação antes do bloco Awakened Tree | Removida |
| `other:Blink Dog.rules.actions.1` | p. 266, linhas 23752–23757: Bite e Teleport bônus, sem Rend | Removida |
| `other:Bone Devil.rules.actions.2` | p. 267, linhas 23908–23917: Claw e Infernal Sting, sem Rend | Removida |
| `other:Brown Bear.rules.actions.2` | p. 346, linhas 30841–30847: Bite e Claw, sem Scratch | Removida |

As remoções confirmadas foram:

| Chave | Achado oficial | Referência | Estado |
|---|---|---|---|
| `other:Basilisk.rules.actions.1` | O bloco oficial contém Bite (+5, alcance 5 ft., 10 (2d6 + 3) perfurante + 7 (2d6) veneno) e Petrifying Gaze em Bonus Actions. Não existe Beard. | Creature Stat Blocks, Basilisk, linhas 732–736; SRD 5.2.1, p. 262 | Verificado; bloco divergente removido |
| `other:Venomous Snake.rules.actions.2` | A única ação é Bite (+4, alcance 5 ft., 4 (1d4 + 2) perfurante + 3 (1d6) veneno). Não existe Hooves. | Creature Stat Blocks, Venomous Snake, linhas 13986–13987; SRD 5.2.1, p. 363 | Verificado; bloco divergente removido |
| `other:Vulture.rules.actions.1` | A única ação é Beak (+2, alcance 5 ft., 2 (1d4) perfurante). Não existe Hooves. | Creature Stat Blocks, Vulture, linhas 14022–14024; SRD 5.2.1, p. 363 | Verificado; bloco divergente removido |

As linhas oficiais também confirmam alcance, ataque, dano e texto integral da ação válida correspondente. Isso valida a associação e a restauração textual desses alvos, não as demais estatísticas das criaturas. Não se restaurou texto inglês nem tradução para as três ações inexistentes; os campos traduzidos associados foram removidos. Os outros 137 alvos permanecem com texto e mecânica inalterados, mas sem marcador `reviewed`, pendentes de verificação individual do nome, texto completo, alcance e dano.

## Apresentação e catálogo compartilhado

O compêndio usa `translatedCompendiumText` para os campos aninhados de regras. A ficha/bestiário usa `localizedMonsterField` para `pt-BR.rules.*` e mantém o inglês como fallback quando uma chave localizada não existe. O importador do catálogo compartilhado aplica campos com proveniência `reviewed`, substitui valores existentes com proveniência `ai` ou ausente e preserva fontes protegidas (`manual`, `official`, `reviewed`, `human`, `user`). A rotina é idempotente ao reimportar os mesmos valores. Esta revisão foi somente de código e pacote: nenhum banco foi acessado ou sincronizado.

## Pendências

- Cotejar individualmente os 137 objetos de ação ainda pendentes no manifesto com seus blocos oficiais; até isso ocorrer, suas fontes e traduções permanecem preservadas e não são consideradas completas nem mecanicamente validadas.
- Não considerar `reviewed` validação mecânica abrangente.
- Não foi realizada sincronização nem integração com banco; sua política foi verificada no código e nos testes unitários existentes.
