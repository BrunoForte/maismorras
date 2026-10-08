# Localização PT-BR dos truques do SRD 5.2.1

Este lote localiza as 28 entradas `spell` de nível 0 presentes em `srd_5_2_1.json`. A referência de conteúdo é o SRD 5.2.1 em inglês da Wizards of the Coast e a página oficial de descrições de magias das Basic Rules 2024. As sinopses são redação editorial concisa em português, não tradução automática em lote.

- [SRD 5.2.1 oficial](https://www.dndbeyond.com/srd)
- [Descrições de magias — Basic Rules 2024](https://www.dndbeyond.com/sources/dnd/br-2024/spell-descriptions)

## Convenções editoriais

| Conceito | Forma usada |
| --- | --- |
| Cantrip | truque |
| Spellcasting | conjuração |
| Range / duration | alcance / duração |
| Concentration | concentração |
| Verbal / somatic / material components | componentes verbais / somáticos / materiais |
| Saving throw | salvaguarda |
| Ability check | teste de atributo |
| Spell attack | ataque mágico; quando à distância, ataque mágico à distância |
| Hit points | pontos de vida |
| Bright Light / Dim Light | Luz plena / Luz fraca |
| Advantage / Disadvantage | Vantagem / Desvantagem |
| Feet | pés |

As enumerações estruturadas `rules.school`, `rules.classes`, `rules.damage.type`, `rules.savingThrow`, os valores de nível, componentes, duração e alcance permanecem intactos. Fórmulas, quantidades e mecânicas nos textos-fonte também foram mantidas; os resumos novos dos registros que só tinham placeholder são sinopses e não substituem regras completas.

## Decisões de nomes e validação editorial

- Sorcerous Burst → **Rajada Arcana** (nome aprovado explicitamente pelo proprietário).
- Shillelagh → **Bordão Místico**, Starry Wisp → **Fagulha Estelar**, Spare the Dying → **Poupar os Mortos**, True Strike → **Ataque Verdadeiro** e Vicious Mockery → **Zombaria Viciosa** são escolhas editoriais deste lote; ficam pendentes de validação do proprietário se houver dúvida terminológica.

Os demais nomes usam formas PT-BR descritivas já difundidas, como Respingos Ácidos, Toque Arrepiante, Luzes Dançantes e Mãos Mágicas. O registro-fonte `Acid SplASh` contém capitalização irregular e é uma duplicata do nome Acid Splash; a grafia de origem foi preservada e só o campo de exibição foi localizado.

## Revisão das descrições completas

As 13 entradas que já tinham `rules.description` receberam texto integral em `pt-BR.rules.description`, conferido com as descrições oficiais das Basic Rules 2024 e o SRD 5.2.1. A revisão completou áreas e salvaguardas, opções de efeito, alvos, exceções, limites, duração e aprimoramentos por nível quando aplicáveis. Em particular, Sorcerous Burst inclui os sete tipos de dano, a rolagem adicional em resultado 8, seu limite pelo modificador da habilidade de conjuração e o escalonamento nos níveis 5, 11 e 17. Os 15 registros que não tinham descrição de regra continuam sem esse campo; suas traduções de sumário são sinopses editoriais, não regras completas.

## Proveniência

`pt-BR`, `pt-BR.summary` e, quando esses campos já existem em `rules`, `pt-BR.rules.name` e `pt-BR.rules.description` recebem `.source = "reviewed"` porque foram revisados neste lote. Nenhum outro campo localizado foi criado. Os nomes-fonte, IDs e regras estruturadas permanecem intactos. Na revisão posterior, o `summary` e o `rules.description` em inglês de Sorcerous Burst foram alinhados ao texto oficial do SRD 5.2.1, pois a cópia anterior do pacote estava desatualizada; nenhum valor mecânico estruturado foi alterado.
