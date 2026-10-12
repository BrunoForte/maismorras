# SRD 5.2.1 — itens mágicos (localização PT-BR)

## Escopo e critério

Este lote cobre 248 registros do pacote cuja categoria é `other` e cujo campo `rules.catalog` é `magic-item`. A chave estável de referência editorial é `other:<nome-fonte em inglês>`; o pacote não fornece ID para esses registros. A seleção não altera os 17 registros distintos de `entryType=item` que já existem no catálogo tipado.

Os nomes foram conferidos editorialmente contra o SRD 5.2.1, usando o [PDF oficial do SRD 5.2.1](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf) como fonte primária. As formas em português são traduções editoriais do projeto e **não** traduções oficiais da Wizards of the Coast.

## Limites dos dados disponíveis

Os 248 registros têm somente o nome, um sumário genérico já em português (`Item mágico do System Reference Document 5.2.1.`) e a regra estruturada `catalog: magic-item`. Não há descrição, propriedades, raridade, bônus ou demais mecânicas nesses registros. Por isso, este lote localiza somente os nomes; o sumário genérico e `rules` permanecem intactos. Não foram criadas descrições nem mecânicas.

Em cada registro, `translations["pt-BR"]` é o nome localizado e `translations["pt-BR.source"] = "reviewed"` indica revisão editorial desse campo de nome. Não significa que regras mecânicas tenham sido validadas.

## Apresentação

O compêndio já usa `translations["pt-BR"]` para nome e mantém o nome-fonte como fallback. A ficha foi ajustada para incluir no seletor de inventário os registros `other` com `rules.catalog = magic-item`. Eles entram no grupo “Outros itens”, mantêm o ID original e carregam apenas a regra catalog existente; propriedades ausentes não são inferidas. Registros `other` de criaturas, condições e outros catálogos continuam excluídos.

## Propagação ao catálogo compartilhado

O fluxo existente `ensureDefaults` → `ensureSharedCatalog` carrega o pacote embutido ao listar o compêndio e chama `syncReviewedTranslations` em cada carregamento. A sincronização aplica campos cujo pacote tem proveniência `reviewed`: traduções canônicas antigas com origem `ai` ou sem `.source` são substituídas; fontes protegidas (como `manual`, `official`, `reviewed`, `human` e `user`) não são sobrescritas. A mesclagem da campanha só deixa um override de IA/sem origem prevalecer quando a tradução canônica ainda não foi revisada; com este lote revisado, o nome canônico prevalece, enquanto overrides protegidos continuam isolados por campanha.

A operação é idempotente: depois de gravar o mesmo valor com origem `reviewed`, uma repetição não o altera. Esse comportamento já é coberto pelos testes de política de sincronização e pela integração do catálogo existente. A revisão do pacote (`revision`) não foi incrementada: a atualização dos campos revisados ocorre pelo sincronizador em cada carregamento, sem migration nem atualização manual do banco. Nenhuma sincronização ou acesso a banco foi executado durante este lote.

## Decisões editoriais

Formas indicadas e aprovadas pelo proprietário para evitar colisões ou estabelecer o glossário:

- Bag of Holding → **Bolsa de Carga**
- Periapt of Health → **Periapto da Saúde**, distinto de Amulet of Health → **Amuleto da Saúde**
- Ammunition of Slaying → **Munição Matadora**
- Mace of Disruption → **Maça da Ruptura**
- Ioun Stone → **Pedra Ioun**

Nos 17 nomes que também existem como `entryType=item`, o título neste lote foi alinhado ao título já existente no registro tipado. A tabela inclui todos os nomes-fonte e suas formas PT-BR para revisão.

| Chave estável / nome-fonte | Nome PT-BR |
|---|---|
| `other:Adamantine Armor` | Armadura de Adamantina |
| `other:Ammunition of Slaying` | Munição Matadora |
| `other:Amulet of Health` | Amuleto da Saúde |
| `other:Amulet of the Planes` | Amuleto dos Planos |
| `other:Animated Shield` | Escudo Animado |
| `other:Apparatus of the Crab` | Aparato do Caranguejo |
| `other:Armor of Invulnerability` | Armadura da Invulnerabilidade |
| `other:Armor of Resistance` | Armadura de Resistência |
| `other:Armor of Vulnerability` | Armadura da Vulnerabilidade |
| `other:Arrow-Catching Shield` | Escudo Captura-Flechas |
| `other:Bag of Beans` | Saco de Feijões |
| `other:Bag of Devouring` | Saco Devorador |
| `other:Bag of Holding` | Bolsa de Carga |
| `other:Bag of Tricks` | Saco de Truques |
| `other:Bead of Force` | Pérola da Força |
| `other:Bead of Nourishment` | Pérola da nutrição |
| `other:Belt of Dwarvenkind` | Cinto dos Anões |
| `other:Belt of Giant Strength` | Cinto de Força de Gigante |
| `other:Berserker Axe` | Machado do Berserker |
| `other:Boots of Elvenkind` | Botas Élficas |
| `other:Boots of Levitation` | Botas de Levitação |
| `other:Boots of Speed` | Botas da Velocidade |
| `other:Boots of Striding and Springing` | Botas de Passada e Impulsão |
| `other:Boots of the Winterlands` | Botas das Terras Invernais |
| `other:Bowl of Commanding Water Elementals` | Tigela de Comando de Elementais da Água |
| `other:Bracers of Archery` | Braçadeiras de Arquearia |
| `other:Bracers of Defense` | Braçadeiras de Defesa |
| `other:Brazier of Commanding Fire Elementals` | Braseiro de Comando de Elementais do Fogo |
| `other:Brooch of Shielding` | Broche de Proteção |
| `other:Broom of Flying` | Vassoura Voadora |
| `other:Candle of Invocation` | Vela de Invocação |
| `other:Cape of the Mountebank` | Capa do Charlatão |
| `other:Carpet of Flying` | Tapete Voador |
| `other:Censer of Controlling Air Elementals` | Incensário de Controle de Elementais do Ar |
| `other:Chime of Opening` | Carrilhão de Abertura |
| `other:Circlet of Blasting` | Diadema de Rajadas |
| `other:Cloak of Arachnida` | Manto de Aracnídeo |
| `other:Cloak of Displacement` | Manto do Deslocamento |
| `other:Cloak of Elvenkind` | Manto Élfico |
| `other:Cloak of Invisibility` | Manto da invisibilidade |
| `other:Cloak of Protection` | Manto de Proteção |
| `other:Cloak of the Bat` | Manto do Morcego |
| `other:Cloak of the Manta Ray` | Manto da Arraia |
| `other:Crystal Ball` | Bola de Cristal |
| `other:Crystal Ball of Mind Reading` | Bola de Cristal de Leitura Mental |
| `other:Crystal Ball of Telepathy` | Bola de Cristal de Telepatia |
| `other:Crystal Ball of True Seeing` | Bola de Cristal de Visão da Verdade |
| `other:Cube of Force` | Cubo da Força |
| `other:Cubic Gate` | Portal Cúbico |
| `other:Dagger of Venom` | Adaga Venenosa |
| `other:Dancing Sword` | Espada Dançarina |
| `other:Decanter of Endless Water` | Jarra de Água Infinita |
| `other:Deck of Illusions` | Baralho de Ilusões |
| `other:Defender` | Defensora |
| `other:Demon Armor` | Armadura Demoníaca |
| `other:Dimensional Shackles` | Algemas Dimensionais |
| `other:Dragon Orb` | Orbe do Dragão |
| `other:Dragon Scale Mail` | Cota de Malha de Escamas de Dragão |
| `other:Dragon Slayer` | Matador de Dragões |
| `other:Dust of Disappearance` | Pó do Desaparecimento |
| `other:Dust of Dryness` | Pó da Secura |
| `other:Dust of Sneezing and Choking` | Pó de Espirros e Sufocamento |
| `other:Dwarven Plate` | Armadura de Placas Anã |
| `other:Dwarven Thrower` | Arremessador Anão |
| `other:Efficient Quiver` | Aljava Eficiente |
| `other:Efreeti Bottle` | Garrafa de Efreeti |
| `other:Elemental Gem` | Gema Elemental |
| `other:Elixir of Health` | Elixir da saúde |
| `other:Elven Chain` | Cota de malha élfica |
| `other:Energy Bow` | Arco de energia |
| `other:Eversmoking Bottle` | Garrafa de Fumaça Incessante |
| `other:Eyes of Charming` | Olhos do Encantamento |
| `other:Eyes of Minute Seeing` | Olhos de Visão Minuciosa |
| `other:Eyes of the Eagle` | Olhos da Águia |
| `other:Feather Token` | Ficha de Pena |
| `other:Figurine of Wondrous Power` | Estatueta de Poder Maravilhoso |
| `other:Flame Tongue` | Língua Flamejante |
| `other:Folding Boat` | Barco Dobrável |
| `other:Frost Brand` | Marca Gélida |
| `other:Gauntlets of Ogre Power` | Manoplas de Força de Ogro |
| `other:Gem of Brightness` | Gema do Brilho |
| `other:Gem of Seeing` | Gema da Visão |
| `other:Giant Slayer` | Matador de Gigantes |
| `other:Glamoured Studded Leather` | Armadura de Couro Batido Ilusória |
| `other:Gloves of Missile Snaring` | Luvas de Captura de Projéteis |
| `other:Gloves of Swimming and Climbing` | Luvas de Natação e Escalada |
| `other:Gloves of Thievery` | Luvas de ladinagem |
| `other:Goggles of Night` | Óculos da Noite |
| `other:Hammer of Thunderbolts` | Martelo dos Raios |
| `other:Handy Haversack` | Mochila Prática |
| `other:Hat of Disguise` | Chapéu do Disfarce |
| `other:Hat of Many Spells` | Chapéu de muitas magias |
| `other:Headband of Intellect` | Faixa de Intelecto |
| `other:Helm of Brilliance` | Elmo do Brilho |
| `other:Helm of Comprehending Languages` | Elmo da Compreensão de Idiomas |
| `other:Helm of Telepathy` | Elmo da Telepatia |
| `other:Helm of Teleportation` | Elmo do Teletransporte |
| `other:Holy Avenger` | Vingadora Sagrada |
| `other:Horn of Blasting` | Trompa Explosiva |
| `other:Horn of Valhalla` | Trompa de Valhala |
| `other:Horseshoes of a Zephyr` | Ferraduras de Zéfiro |
| `other:Horseshoes of Speed` | Ferraduras da Velocidade |
| `other:Immovable Rod` | Bastão Imóvel |
| `other:Instant Fortress` | Fortaleza Instantânea |
| `other:Ioun Stone` | Pedra Ioun |
| `other:Iron Bands` | Faixas de Ferro |
| `other:Iron Flask` | Frasco de Ferro |
| `other:Javelin of Lightning` | Azagaia Relampejante |
| `other:Lantern of Revealing` | Lanterna Reveladora |
| `other:Luck Blade` | Lâmina da Sorte |
| `other:Mace of Disruption` | Maça da Ruptura |
| `other:Mace of Smiting` | Maça Esmagadora |
| `other:Mace of Terror` | Maça do Terror |
| `other:Mantle of Spell Resistance` | Manto de Resistência a Magias |
| `other:Manual of Bodily Health` | Manual da Saúde Corporal |
| `other:Manual of Gainful Exercise` | Manual de Exercícios Físicos |
| `other:Manual of Golems` | Manual dos Golens |
| `other:Manual of Quickness of Action` | Manual da Agilidade |
| `other:Marvelous Pigments` | Pigmentos Maravilhosos |
| `other:Medallion of Thoughts` | Medalhão dos Pensamentos |
| `other:Mirror of Life Trapping` | Espelho Aprisionador de Vidas |
| `other:Mithral Armor` | Armadura de Mitral |
| `other:Mysterious Deck` | Baralho misterioso |
| `other:Necklace of Adaptation` | Colar da Adaptação |
| `other:Necklace of Fireballs` | Colar de Bolas de Fogo |
| `other:Necklace of Prayer Beads` | Colar de Contas de Oração |
| `other:Nine Lives Stealer` | Ladrão de Nove Vidas |
| `other:Oathbow` | Arco do Juramento |
| `other:Oil of Etherealness` | Óleo da Forma Etérea |
| `other:Oil of Sharpness` | Óleo de Afiamento |
| `other:Oil of Slipperiness` | Óleo Escorregadio |
| `other:Pearl of Power` | Pérola do Poder |
| `other:Periapt of Health` | Periapto da Saúde |
| `other:Periapt of Proof against Poison` | Periapto de Proteção contra Veneno |
| `other:Periapt of Wound Closure` | Periapto de Fechamento de Feridas |
| `other:Philter of Love` | Filtro do Amor |
| `other:Pipes of Haunting` | Flautas Assombradoras |
| `other:Pipes of the Sewers` | Flautas dos Esgotos |
| `other:Plate Armor of Etherealness` | Armadura de Placas da Forma Etérea |
| `other:Portable Hole` | Buraco Portátil |
| `other:Potion of Animal Friendship` | Poção de Amizade Animal |
| `other:Potion of Clairvoyance` | Poção de Clarividência |
| `other:Potion of Climbing` | Poção de Escalada |
| `other:Potion of Diminution` | Poção de Redução |
| `other:Potion of Flying` | Poção de Voo |
| `other:Potion of Gaseous Form` | Poção de Forma Gasosa |
| `other:Potion of Growth` | Poção de Crescimento |
| `other:Potion of Heroism` | Poção de Heroísmo |
| `other:Potion of Invisibility` | Poção de Invisibilidade |
| `other:Potion of Invulnerability` | Poção de invulnerabilidade |
| `other:Potion of Longevity` | Poção da longevidade |
| `other:Potion of Mind Reading` | Poção de Leitura Mental |
| `other:Potion of Poison` | Poção de Veneno |
| `other:Potion of Resistance` | Poção de Resistência |
| `other:Potion of Speed` | Poção da Velocidade |
| `other:Potion of Vitality` | Poção de vitalidade |
| `other:Potion of Water Breathing` | Poção de Respiração Aquática |
| `other:Quarterstaff of the Acrobat` | Bordão do Acrobata |
| `other:Ring of Animal Influence` | Anel da Influência Animal |
| `other:Ring of Djinni Summoning` | Anel de Invocação de Djinni |
| `other:Ring of Elemental Command` | Anel de Comando Elemental |
| `other:Ring of Evasion` | Anel da Evasão |
| `other:Ring of Feather Falling` | Anel da Queda Suave |
| `other:Ring of Free Action` | Anel da Liberdade de Movimento |
| `other:Ring of Invisibility` | Anel da Invisibilidade |
| `other:Ring of Jumping` | Anel do Salto |
| `other:Ring of Mind Shielding` | Anel de Proteção Mental |
| `other:Ring of Protection` | Anel de Proteção |
| `other:Ring of Regeneration` | Anel de Regeneração |
| `other:Ring of Resistance` | Anel de Resistência |
| `other:Ring of Shooting Stars` | Anel das Estrelas Cadentes |
| `other:Ring of Spell Storing` | Anel de Armazenamento de Magias |
| `other:Ring of Spell Turning` | Anel de Reflexão de Magias |
| `other:Ring of Swimming` | Anel de Natação |
| `other:Ring of Telekinesis` | Anel de Telecinese |
| `other:Ring of the Ram` | Anel do Carneiro |
| `other:Ring of Three Wishes` | Anel dos Três Desejos |
| `other:Ring of Warmth` | Anel do Calor |
| `other:Ring of Water Walking` | Anel de Caminhada sobre a Água |
| `other:Ring of X-ray Vision` | Anel de Visão de Raios X |
| `other:Robe of Eyes` | Manto dos Olhos |
| `other:Robe of Scintillating Colors` | Manto de Cores Cintilantes |
| `other:Robe of Stars` | Manto das Estrelas |
| `other:Robe of the Archmagi` | Manto dos Arquimagos |
| `other:Robe of Useful Items` | Manto de Itens Úteis |
| `other:Rod of Absorption` | Bastão de Absorção |
| `other:Rod of Alertness` | Bastão de Alerta |
| `other:Rod of Lordly Might` | Bastão da Majestade Senhorial |
| `other:Rod of Resurrection` | Bastão da ressurreição |
| `other:Rod of Rulership` | Bastão de Domínio |
| `other:Rod of Security` | Bastão de Segurança |
| `other:Rope of Climbing` | Corda de Escalada |
| `other:Rope of Entanglement` | Corda de Emaranhamento |
| `other:Scarab of Protection` | Escaravelho de Proteção |
| `other:Scimitar of Speed` | Cimitarra da Velocidade |
| `other:Sending Stones` | Pedras de mensagem |
| `other:Sentinel Shield` | Escudo sentinela |
| `other:Shield of Missile Attraction` | Escudo de Atração de Projéteis |
| `other:Shield of the Cavalier` | Escudo do Cavaleiro |
| `other:Slippers of Spider Climbing` | Chinelos de Escalada de Aranha |
| `other:Sovereign Glue` | Cola Soberana |
| `other:Spellguard Shield` | Escudo de Proteção contra Magias |
| `other:Sphere of Annihilation` | Esfera da Aniquilação |
| `other:Staff of Charming` | Cajado do Encantamento |
| `other:Staff of Fire` | Cajado do Fogo |
| `other:Staff of Frost` | Cajado do Gelo |
| `other:Staff of Healing` | Cajado da Cura |
| `other:Staff of Power` | Cajado do Poder |
| `other:Staff of Striking` | Cajado de Golpes |
| `other:Staff of Swarming Insects` | Cajado de Enxame de Insetos |
| `other:Staff of the Magi` | Cajado dos Magos |
| `other:Staff of the Python` | Cajado da Píton |
| `other:Staff of the Woodlands` | Cajado das Florestas |
| `other:Staff of Thunder and Lightning` | Cajado do Trovão e Relâmpago |
| `other:Staff of Withering` | Cajado do Definhamento |
| `other:Stone of Controlling Earth Elementals` | Pedra de Controle de Elementais da Terra |
| `other:Sun Blade` | Lâmina Solar |
| `other:Sword of Life Stealing` | Espada Sugadora de Vidas |
| `other:Sword of Sharpness` | Espada Afiada |
| `other:Sword of Wounding` | Espada de Ferimentos |
| `other:Talisman of Pure Good` | Talismã do Bem Absoluto |
| `other:Talisman of the Sphere` | Talismã da Esfera |
| `other:Talisman of Ultimate Evil` | Talismã do Mal Supremo |
| `other:Thunderous Greatclub` | Clava trovejante |
| `other:Tome of Clear Thought` | Tomo do Pensamento Claro |
| `other:Tome of Leadership and Influence` | Tomo da Liderança e Influência |
| `other:Tome of Understanding` | Tomo da Compreensão |
| `other:Trident of Fish Command` | Tridente de Comando de Peixes |
| `other:Universal Solvent` | Solvente Universal |
| `other:Vicious Weapon` | Arma Cruel |
| `other:Vorpal Sword` | Espada Vorpal |
| `other:Wand of Binding` | Varinha de Imobilização |
| `other:Wand of Enemy Detection` | Varinha de Detecção de Inimigos |
| `other:Wand of Fear` | Varinha do Medo |
| `other:Wand of Fireballs` | Varinha de Bolas de Fogo |
| `other:Wand of Lightning Bolts` | Varinha de Relâmpagos |
| `other:Wand of Magic Detection` | Varinha de Detecção de Magia |
| `other:Wand of Magic Missiles` | Varinha de Mísseis Mágicos |
| `other:Wand of Paralysis` | Varinha da Paralisia |
| `other:Wand of Polymorph` | Varinha de Metamorfose |
| `other:Wand of Secrets` | Varinha dos Segredos |
| `other:Wand of Web` | Varinha de Teia |
| `other:Wand of Wonder` | Varinha das Maravilhas |
| `other:Weapon of Warning` | Arma de Alerta |
| `other:Well of Many Worlds` | Poço de Muitos Mundos |
| `other:Wind Fan` | Leque de Vento |
| `other:Winged Boots` | Botas Aladas |
| `other:Wings of Flying` | Asas Voadoras |

Sobreposição com itens tipados (17; registros tipados não alterados): `Bead of Nourishment`, `Cloak of Invisibility`, `Dragon Orb`, `Elixir of Health`, `Energy Bow`, `Gloves of Thievery`, `Hat of Many Spells`, `Mysterious Deck`, `Potion of Invulnerability`, `Potion of Longevity`, `Potion of Vitality`, `Quarterstaff of the Acrobat`, `Rod of Resurrection`, `Sending Stones`, `Sentinel Shield`, `Shield of the Cavalier`, `Thunderous Greatclub`.
