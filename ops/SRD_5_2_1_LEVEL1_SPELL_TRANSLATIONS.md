# SRD 5.2.1: truques e magias de 1º círculo em PT-BR

Este lote reúne as traduções revisadas dos 28 registros `spell` de nível 0 já
preparadas no lote de truques e completa a descrição em PT-BR dos 57 registros
`spell` cujo `rules.level` é `1`. Nomes-fonte, sumários-fonte, regras
estruturadas e valores mecânicos foram mantidos. Os campos localizados recebem
proveniência `reviewed`.

## Escopo dos campos

- Todos os 57 registros de 1º círculo recebem `pt-BR`, `pt-BR.summary`,
  `pt-BR.rules.description` e os respectivos marcadores `.source`.
- Os 19 registros que já tinham `rules.name` recebem `pt-BR.rules.name`.
- Os 19 registros com `rules.description` em inglês tiveram esse texto
  integralmente localizado e comparado à fonte oficial. Para os outros 38,
  que não tinham descrição no pacote, a descrição foi redigida em PT-BR com
  base no texto oficial do SRD 5.2.1. Essas descrições são texto de
  apresentação dentro de `translations["pt-BR.rules.description"]`; não criam
  nem modificam regras estruturadas.
- Os novos sumários para registros que tinham apenas o placeholder do pacote
  são sinopses editoriais concisas das regras oficiais. Não substituem nem
  criam `rules.description` ou campos de automação.
- Nos truques, as traduções revisadas existentes foram reconciliadas somente
  em `translations`; os 15 registros que ainda têm apenas sinopses continuam
  sem descrição completa localizada neste lote.

## Exibição e integridade

`CharacterSheet.svelte` resolve a descrição pela chave
`translations["pt-BR.rules.description"]` usando `localizedSpellField` em
`characterSpellRules.ts`. `CanvasMesa.svelte` reutiliza o mesmo helper. O teste
de interface carrega o pacote real e verifica que as 57 descrições são
retornadas por esse caminho. O teste do pacote também fixa a cobertura e
compara um resumo criptográfico dos nomes-fonte, sumários-fonte e regras
estruturadas das 57 entradas com a base antes da edição.

As descrições traduzidas diretamente de texto que já existia no pacote são
traduções da fonte inglesa. As 38 descrições sem texto-fonte no pacote são
sínteses fiéis redigidas a partir das descrições correspondentes do SRD 5.2.1
oficial; em ambos os casos foram revisados os alvos, ações, alcance, duração,
salvaguardas, efeitos, exceções e regras de espaços de nível superior. Não
foram acrescentados valores em campos mecânicos.

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
- [PDF oficial do SRD 5.2.1](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf)
- [D&D Beyond Basic Rules 2024 — Spell Descriptions](https://www.dndbeyond.com/sources/dnd/br-2024/spell-descriptions).
