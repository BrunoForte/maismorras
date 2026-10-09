# SRD 5.2.1: magias dos círculos 7–9 em PT-BR

Este lote completa a localização e auditoria de 52 magias: 20 do 7º círculo,
16 do 8º e 16 do 9º. Os círculos 0–6 permanecem como integrados em `main`.
Nomes, sumários e descrições estão nos caminhos já consumidos pelo catálogo:
`pt-BR`, `pt-BR.summary` e `pt-BR.rules.description`, todos com
`.source = "reviewed"`. As regras estruturadas recebem
`mechanicsAudit.status = "reviewed"` e fonte `D&D SRD 5.2.1`.

## Registros cobertos

- **7º círculo (20):** Arcane Sword, Conjure Celestial, Delayed Blast
  Fireball, Divine Word, Etherealness, Finger of Death, Fire Storm, Forcecage,
  Magnificent Mansion, Mirage Arcane, Plane Shift, Prismatic Spray, Project
  Image, Regenerate, Resurrection, Reverse Gravity, Sequester, Simulacrum,
  Symbol e Teleport.
- **8º círculo (16):** Animal Shapes, Antimagic Field, Befuddlement, Clone,
  Control Weather, Demiplane, Dominate Monster, Earthquake, Glibness, Holy
  Aura, Incendiary Cloud, Maze, Mind Blank, Power Word Stun, Sunburst e
  Tsunami.
- **9º círculo (16):** Astral Projection, Foresight, Gate, Imprisonment,
  Mass Heal, Meteor Swarm, Power Word Heal, Power Word Kill, Prismatic Wall,
  Shapechange, Storm of Vengeance, Time Stop, True Polymorph, True
  Resurrection, Weird e Wish.

## Auditoria mecânica

Entre as 52 entradas, 19 têm dano tipado e 33 usam `rules.damage: null`; quatro
têm escalonamento por espaço (Conjure Celestial, Delayed Blast Fireball,
Etherealness e Dominate Monster) e 48 usam `rules.scaling: null`. Dano inclui
alternativas cromáticas de Prismatic Spray/Wall, efeitos por turno de Storm of
Vengeance e Tsunami, acúmulo de Delayed Blast Fireball, dano condicional de
Teleport e dano ao retorno de Etherealness. As traduções não mudam estatísticas,
IDs, alcance estruturado, regras-fonte nem lógica de rolagem.

Os três registros que já tinham o formato legado de dano mantêm `type` e `dice`
para compatibilidade com consumidores antigos: Finger of Death e Tsunami
preservam seus dados iniciais. Meteor Swarm agora informa `20d6` de fogo nesse
formato (em vez do antigo `40d6` incorreto para um único tipo) e registra
separadamente `20d6` contundente; a estrutura tipada representa os dois danos
oficiais sem somá-los em uma fórmula ambígua.

As distâncias nas descrições em português foram convertidas para o sistema
métrico. Códigos e expressões mecânicas canônicas permanecem nos dados
estruturados; a interface traduz os tipos de dano e rótulos de gatilho. As
descrições vêm do texto completo do [SRD 5.2.1 oficial (PDF)](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf).

## Glossário e escolhas editoriais

Foram mantidos os termos usados nos lotes anteriores: ação Mágica, ação bônus,
Reação, Concentração, salvaguarda, PV, PV Temporários, Teste de d20, Vantagem,
Desvantagem, Terreno Difícil, Cego, Surdo, Enfeitiçado, Impedido, Atordoado,
Caído, Petrificado, Amedrontado, Invisível, Morto-vivo, Constructo e Corruptor.
Planos e tipos de criatura conservam seus nomes canônicos traduzidos pelo
glossário do projeto.

O proprietário aprovou estas formas: Etherealness → **Forma Etérea**, Mind
Blank → **Mente Vazia**, Plane Shift → **Viagem Planar**, Weird → **Estranho**
e Glibness → **Loquacidade**. Os demais títulos são escolhas editoriais do
lote, sem aprovação individual registrada. Nomes ingleses-fonte permanecem
intactos.

## Sincronização e escopo

A revisão do pacote avança para `cartridge-import-5`, permitindo que a
sincronização controlada já existente identifique o lote. Esta tarefa não
executou sincronização, migration ou acesso a banco; a propagação depende do
fluxo revisável do projeto. Nenhuma entrada fora das magias de nível 7–9 foi
alterada.
