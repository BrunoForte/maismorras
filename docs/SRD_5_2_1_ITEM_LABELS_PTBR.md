# Rótulos de categorias e propriedades de itens do SRD 5.2.1

Esta alteração localiza somente rótulos de apresentação. Os valores canônicos do pacote permanecem em inglês para filtros, regras, cálculos e persistência. As traduções abaixo são escolhas editoriais do projeto, não traduções oficiais da Wizards of the Coast.

## Inventário e seleção

- Base: `origin/main` em `3bbdeb6683e9df50568cd03ff39abce8f3610fe1`.
- Seleção: entradas `entryType: item` no pacote `backend/internal/compendium/packs/srd_5_2_1.json`.
- O pacote contém 95 entradas `item`. Oito valores distintos de `rules.category` e 17 valores distintos de `rules.properties` são usados nesses registros.
- Nenhum campo do pacote foi modificado.

## Categorias exibidas

| Valor canônico   | Rótulo PT-BR                 |
| ---------------- | ---------------------------- |
| `Simple Melee`   | Armas Simples Corpo a Corpo  |
| `Simple Ranged`  | Armas Simples à Distância    |
| `Martial Melee`  | Armas Marciais Corpo a Corpo |
| `Martial Ranged` | Armas Marciais à Distância   |
| `Light`          | Armadura Leve                |
| `Medium`         | Armadura Média               |
| `Heavy`          | Armadura Pesada              |
| `Shield`         | Escudo                       |

## Propriedades exibidas

| Valor canônico         | Rótulo PT-BR       |
| ---------------------- | ------------------ |
| `Ammunition (25/100)`  | Munição (25/100)   |
| `Ammunition (30/120)`  | Munição (30/120)   |
| `Ammunition (100/400)` | Munição (100/400)  |
| `Ammunition (80/320)`  | Munição (80/320)   |
| `Ammunition (150/600)` | Munição (150/600)  |
| `Ammunition (40/120)`  | Munição (40/120)   |
| `Ammunition (30/90)`   | Munição (30/90)    |
| `Thrown (20/60)`       | Arremesso (20/60)  |
| `Thrown (30/120)`      | Arremesso (30/120) |
| `Versatile (1d10)`     | Versátil (1d10)    |
| `Versatile (1d8)`      | Versátil (1d8)     |
| `Loading`              | Recarga            |
| `Light`                | Leve               |
| `Finesse`              | Acuidade           |
| `Heavy`                | Pesada             |
| `Reach`                | Alcance            |
| `Two-Handed`           | Duas Mãos          |

Os números e expressões entre parênteses são mantidos literalmente. Valores futuros desconhecidos e conteúdo personalizado usam o próprio texto como fallback.

## Caminhos de apresentação

- Os detalhes do compêndio exibem `rules.category` e `rules.properties` em `CompendiumEntryDetails.svelte`; o novo formatador converte somente os rótulos visíveis.
- O seletor de inventário da ficha já mostra grupos localizados (`Armas`, `Armaduras`, `Escudos`, `Equipamentos`, `Ferramentas` e `Outros itens`). A ficha não exibe os valores canônicos brutos de `rules.category` nem a lista de `rules.properties` em outro ponto.
- Filtros, classificação, persistência, valores do pacote, dano e demais regras continuam usando os dados canônicos sem alteração.

## Testes

Os testes cobrem os oito rótulos de categoria, as 17 strings distintas de propriedade encontradas no pacote, fallback para inglês e valores desconhecidos, renderização do compêndio e preservação dos valores canônicos do item.
