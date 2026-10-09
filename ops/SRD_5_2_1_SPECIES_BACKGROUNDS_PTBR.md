# Localização PT-BR de espécies e antecedentes do SRD 5.2.1

## Escopo e fonte

Este lote cobre as 9 espécies e os 16 antecedentes presentes no pacote compartilhado SRD 5.2.1. As traduções são conteúdo editorial PT-BR do projeto e não são apresentadas como traduções oficiais da Wizards of the Coast. A conferência foi feita contra os textos e regras do pacote SRD 5.2.1 publicado sob CC-BY-4.0: https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf.

IDs, nomes e textos-fonte, escolhas e códigos de atributos, proficiências, equipamentos, talentos concedidos, tamanho, deslocamento, fórmulas e demais regras estruturadas permanecem como no pacote. Os campos de apresentação foram acrescentados ao objeto `translations` com `.source = "reviewed"` nos textos conferidos. Os códigos de atributos continuam mecânicos; a interface os apresenta por rótulos em português.

## Campos localizados

- `pt-BR`: nome de exibição; `pt-BR.summary`: sumário.
- `pt-BR.rules.name` e `pt-BR.rules.description`: título e descrição de espécie/antecedente.
- Espécies: `pt-BR.rules.traits.{índice}.name` e `.description` para cada característica estruturada.
- Antecedentes: `pt-BR.rules.skillProficiencies.{índice}`, `pt-BR.rules.toolProficiency`, `pt-BR.rules.startingEquipment.{índice}` e `pt-BR.rules.feat` para os valores apresentados ao usuário. Os valores mecânicos originais continuam em `rules`.

## Apresentação e sincronização

O compêndio usa `translatedCompendiumText` para preferir os caminhos PT-BR correspondentes e volta ao texto-fonte quando a tradução não existe. A ficha lê os textos de características diretamente da entrada canônica de espécie, com fallback para os resumos locais de espécies legadas; detalhes da linhagem selecionada continuam sendo apresentados pelo perfil existente. Nomes e descrições dos antecedentes e espécies também aparecem nos datalists da identidade da ficha.

O pacote versionado continua sendo a fonte de sincronização compartilhada já carregada pelo backend. Esta mudança só altera o pacote e a apresentação local; não executa sincronização, migration ou gravação em banco.

## Decisões editoriais

- Foram mantidos `Halfling` e `Tiefling` como nomes de espécie, em coerência com o vocabulário já usado no perfil da ficha.
- `Dragonborn` foi localizado como “Draconato”; os demais nomes usam formas correntes do glossário/PT-BR do projeto: “Anão”, “Elfo”, “Gnomo”, “Golias”, “Humano” e “Orc”.
- `Animal Handling` usa a escolha já aprovada pelo proprietário: “Adestrar Animais”.
- Distâncias nas descrições seguem a preferência editorial existente por unidades métricas. Isso altera apenas a formulação localizada; fórmulas, códigos e campos numéricos estruturados do pacote não foram modificados.
- Nenhuma escolha editorial ambígua que exija decisão do proprietário ficou pendente neste lote.

## Integridade e testes

O teste do pacote valida cobertura e proveniência `reviewed` de todos os textos localizados, confere o inventário de 9 espécies e 16 antecedentes e fixa uma assinatura dos nomes/sumários-fonte e das regras mecânicas, excluindo apenas nomes e descrições em `rules`. Testes de interface cobrem as características e escolhas localizadas no compêndio, o fallback ao inglês e a leitura das características de espécie pela ficha. Os testes de integração de sincronização já existentes exercitam repetição idempotente; não foram modificados schema ou banco.
