# SRD 5.2.1: magias de 1º círculo em PT-BR

Este lote localiza os 57 registros `spell` cujo `rules.level` é `1`. Os nomes
em inglês, IDs, regras estruturadas e valores do pacote foram mantidos. Os
campos localizados no pacote recebem proveniência `reviewed`.

## Escopo dos campos

- Todos os 57 registros recebem `pt-BR`, `pt-BR.summary` e os respectivos
  marcadores `.source`.
- Os 19 registros que já tinham `rules.name` recebem `pt-BR.rules.name`.
- Os 19 registros que já tinham `rules.description` recebem
  `pt-BR.rules.description`. O texto localizado acompanha somente a descrição
  resumida que já existe no pacote; não foram acrescentadas descrições aos
  outros 38 registros.
- Os novos sumários para registros que tinham apenas o placeholder do pacote
  são sinopses editoriais concisas das regras oficiais. Não substituem nem
  criam `rules.description` ou campos de automação.

## Terminologia

Segui os usos existentes no projeto: “conjurar magias”, “habilidade de
conjuração”, “espaço de magia”, “Ação Bônus”, “Reação”, “Concentração”,
“alcance”, “duração”, “salvaguarda”, “Pontos de Vida”, “Pontos de Vida
Temporários” e “condição”. Dados e unidades imperiais permanecem em sua forma
de origem (por exemplo, `2d8`, 15 pés); nomes e valores estruturados de regras
não foram alterados.

O proprietário escolheu explicitamente **Perdição** para *Bane*, **Leque
Cromático** para *Color Spray*, **Riso Histérico** para *Hideous Laughter* e
**Raio Nauseante** para *Ray of Sickness*. As outras formas deste lote são
escolhas editoriais para revisão e podem ser ajustadas em uma revisão futura.
O nome em inglês *Hideous Laughter* permanece como está no pacote; a página
atual das Basic Rules apresenta a forma *Tasha’s Hideous Laughter*, e esta
diferença de nome-fonte não foi modificada neste lote.

## Catálogo compartilhado

O catálogo chama `syncReviewedTranslations` durante `ensureSharedCatalog`, em
toda inicialização/acesso ao catálogo. A sincronização aplica cada campo
marcado `reviewed`, substitui valores de IA e sem origem, preserva origens
protegidas e é idempotente. Portanto, esta tradução não exige alterar a
revisão global do pacote: isso evita reimportar os campos de todas as demais
categorias. As campanhas existentes recebem a tradução canônica quando o
catálogo compartilhado é carregado; nenhum banco foi acessado nesta tarefa.

## Referências

- [D&D System Reference Document 5.2.1](https://www.dndbeyond.com/srd)
  (conteúdo atribuído no próprio pacote sob CC BY 4.0).
- [D&D Beyond Basic Rules 2024 — Spell Descriptions](https://www.dndbeyond.com/sources/dnd/br-2024/spell-descriptions).
