# Localização PT-BR: classes, subclasses, talentos e características do SRD 5.2.1

## Escopo editorial

Este lote cobre 12 classes, 19 subclasses, 47 talentos e 18 características do pacote compartilhado. Os campos de catálogo preservam nomes, sumários, descrições e estruturas em inglês; as versões PT-BR ficam em `translations` e recebem `.source = "reviewed"` somente para os campos conferidos. Nenhum identificador, fórmula, progressão, código ou valor mecânico foi traduzido ou alterado.

Fonte de conferência: SRD 5.2.1 oficial, publicado pela Wizards of the Coast em https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf. O texto localizado acompanha os campos existentes no pacote; não foram criadas regras para preencher lacunas.

## Caminhos de localização

- Título: `pt-BR`; sumário: `pt-BR.summary`.
- Nome/descrição de classe ou subclasse: `pt-BR.rules.name` e `pt-BR.rules.description`.
- Características aninhadas de classe/subclasse: `pt-BR.rules.features.{índice}.name` e `.description`.
- Nome/descrição das características individuais: `pt-BR.rules.name` e `pt-BR.rules.description`.
- Descrição de talento: `pt-BR.rules.description`; cada benefício: `pt-BR.rules.benefits.{índice}`.

A interface consulta esses caminhos em `CompendiumEntryDetails.svelte` e, na ficha, em `CharacterClassProgression`/`deriveCharacterFeatures` e `CharacterDetailsTab`. `translatedCompendiumText` usa a tradução PT-BR quando existe e não é igual ao texto-fonte; caso contrário, mantém o texto-fonte como fallback.

## Decisões editoriais

- O proprietário escolheu `Boon` → **Pacto** e `Ability Score Improvement` → **Aumento no Valor de Habilidade**.
- O proprietário aprovou **Dádiva do Pacto** para `Pact Boon`.
- O proprietário escolheu **Adestrar Animais** para `Animal Handling`.
- O proprietário escolheu **Colégio do Glamour** para `College of Glamour`.
- As demais formas seguem o glossário PT-BR já integrado nos lotes anteriores e o vocabulário corrente das regras de D&D 2024.

## Integridade e testes

As características de classe/subclasse são textos dentro de `rules.features`; os benefícios de talentos são textos em `rules.benefits`. As traduções são paralelas em `translations`; os valores originais, suas posições, IDs e campos estruturados permanecem intactos. Testes de backend verificam os 96 registros e a cobertura/proveniência de cada texto aninhado. Testes de frontend verificam a apresentação localizada no compêndio e na progressão da ficha, além do fallback ao inglês quando a tradução está ausente.
