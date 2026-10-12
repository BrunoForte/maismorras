# Localização PT-BR das condições do SRD 5.2.1

Este lote localiza as 15 entradas identificadas por `rules.catalog = "conditions"` no pacote compartilhado. Elas continuam com `entryType = "other"`; nenhuma outra entrada dessa categoria foi alterada.

## Campos e apresentação

Os campos localizados usam o mapa `translations` já suportado pelo catálogo: nome (`pt-BR`), sumário (`pt-BR.summary`), `rules.name`, `rules.description`, cada item de `rules.effects` e `rules.notes`, quando presente. Todos os campos localizados recebem proveniência `reviewed`.

O compêndio já exibia o nome e o sumário localizados, mas não mostrava as regras dos registros `other`. `CompendiumEntryDetails` agora reconhece somente registros com `rules.catalog = "conditions"` e exibe descrição, efeitos e observações pelas respectivas chaves localizadas, com fallback para o texto-fonte. O seletor de condições do mapa usa `effect_definitions`, uma lista separada já semeada em português pela migration 0017; não foi alterada nem sincronizada nesta tarefa. A lista existente contém 14 condições e não inclui Exaustão.

## Glossário adotado

Blinded: Cego; Charmed: Enfeitiçado; Deafened: Surdo; Exhaustion: Exaustão; Frightened: Amedrontado; Grappled: Agarrado; Incapacitated: Incapacitado; Invisible: Invisível; Paralyzed: Paralisado; Petrified: Petrificado; Poisoned: Envenenado; Prone: Caído; Restrained: Impedido; Stunned: Atordoado; Unconscious: Inconsciente. Termos mecânicos recorrentes seguem o uso existente do projeto, como Vantagem, Desvantagem, teste de habilidade, teste de resistência e deslocamento.

## Fonte e limite do lote

Os nomes e textos-fonte preservados foram conferidos com o pacote SRD 5.2.1. A referência editorial é o [SRD 5.2.1 oficial](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf), seção Rules Glossary, páginas impressas 176–191. As traduções são editoriais do projeto, não traduções oficiais da Wizards of the Coast.

Os textos `rules.effects` e `rules.notes` existentes no pacote são preservados semanticamente na tradução; este lote não corrige nem reestrutura regras. A comparação com a seção oficial mostrou diferenças entre alguns desses textos estruturados existentes e as regras do SRD 5.2.1 (notavelmente Exhaustion e Grappled). A correção dessas fontes/mecânicas exige um lote próprio; não foi feita aqui para respeitar o escopo de localização sem alteração de regras. Por isso, a marca `reviewed` indica revisão da tradução do texto existente, não uma nova validação mecânica do registro.
