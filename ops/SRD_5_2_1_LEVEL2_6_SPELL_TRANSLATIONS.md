# SRD 5.2.1: magias dos círculos 2–6 em PT-BR

Este lote localiza os 201 registros `spell` dos círculos 2–6: 56 do círculo 2,
42 do círculo 3, 34 do círculo 4, 38 do círculo 5 e 31 do círculo 6. Os
nomes-fonte, IDs, resumos-fonte e regras fora dos campos de auditoria/dano/
escalonamento foram preservados. A revisão do pacote passa a `cartridge-import-4`
para que a sincronização controlada detecte os campos revisados.

## Campos e origem

- Cada registro tem nome e sinopse em `translations["pt-BR"]` e
  `translations["pt-BR.summary"]`, com `.source = "reviewed"`.
- Cada registro tem descrição em `translations["pt-BR.rules.description"]`,
  também marcada `reviewed`. O texto foi traduzido a partir das descrições do
  PDF oficial SRD 5.2.1; descrições que incluem blocos de estatísticas foram
  mantidas conforme o conteúdo da própria magia.
- Os campos mecânicos foram conferidos contra a mesma fonte. O pacote marca
  `rules.mechanicsAudit.status = "reviewed"` e a fonte `D&D SRD 5.2.1`.
- 63 entradas têm componentes de dano estruturados e 138 usam
  `rules.damage: null`, indicando que dano fixo da magia não se aplica.
  76 entradas têm escalonamento por espaço de magia e 125 usam
  `rules.scaling: null`. Nenhuma magia de círculo 2–6 escala por nível do
  personagem.
- As 76 cláusulas de espaço superior estão em efeitos tipados
  `kind: "rule-text"`, com os textos inglês e PT-BR pareados, o nível-base e o
  primeiro nível do espaço aplicável. A ficha e os detalhes do compêndio exibem
  o texto na localidade atual; não há cálculo nem alteração de rolagem.
- Os campos localizados continuam nos caminhos lidos pela interface:
  `translations["pt-BR.rules.description"]`; dano e escalonamento vêm de
  `rules.damage` e `rules.scaling`.

## Unidades e decisões de nome

As medidas imperiais das descrições PT-BR foram convertidas para o sistema
métrico. Os valores-fonte estruturados de alcance continuam intactos; a
interface já os apresenta em métrico por `distanceText`.

O proprietário escolheu estas formas: **Alterar-se** (_Alter Self_),
**Acelerar** (_Haste_), **Golpe Resplandecente** (_Shining Smite_),
**Invocar Relâmpagos** (_Call Lightning_), **Contramágica** (_Counterspell_),
**Glifo de Proteção** (_Glyph of Warding_), **Convocar Montaria** (_Find
Steed_), **Vínculo Guardião** (_Warding Bond_) e **Conjurar Seres Feéricos**
(_Conjure Fey_). _Conjure Woodland Beings_ recebeu **Conjurar Seres da
Floresta** para evitar colisão de nomes.

O proprietário definiu estas formas para o lote: **Rogar Maldição** (_Bestow Curse_), **Geas**, **Ferir** (_Harm_), **Consagrar** (_Hallow_), **Golpe Flamejante** (_Flame Strike_), **Impacto Sobrenatural** (_Otherworldly Slam_), **Olhar Cruel** (_Fell Glare_) e **Impacto** (_Slam_, ação de _Animated Object_). Essas escolhas resolvem as dúvidas editoriais registradas durante a preparação; nenhum nome-fonte foi substituído.

## Revisões da extração oficial

O texto extraído do PDF atravessou três limites entre magias. As descrições de
_Fireball_, _Animate Objects_ e _Find Steed_ foram conferidas e terminam no
final da respectiva regra de espaço superior; o texto da magia seguinte não
permanece nos campos PT-BR.

Os blocos oficiais de estatísticas de _Animate Objects_ e _Find Steed_ aparecem
separados do texto da magia na extração do PDF. Foram incluídos nas descrições
localizadas e usados para completar as fórmulas de dano e os tipos
correspondentes.

## Fonte

- [D&D System Reference Document 5.2.1 (PDF oficial)](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf), conteúdo disponibilizado sob CC BY 4.0.
- [D&D Beyond Basic Rules 2024 — Spell Descriptions](https://www.dndbeyond.com/sources/dnd/br-2024/spell-descriptions).

Nenhum banco foi acessado. Não foi executada migration nem sincronização do
catálogo; a propagação às campanhas existentes depende do fluxo controlado já
integrado ao projeto.
