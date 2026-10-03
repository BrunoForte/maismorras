# Preparação para sistemas de RPG adicionais

## Estado desta etapa

O produto continua suportando somente D&D 2024, agora preso à referência imutável
`dnd2024@1.0.0`. A referência é gravada na campanha. O registry descreve o
sistema e resolve, separadamente, o contrato tipado de rolagens d20 que já é
usado pelo backend. Não há carregamento de regras de PDF, código fornecido por
usuários nem execução de fórmulas arbitrárias.

O backend valida sistema e versão no endpoint de criação da campanha. A validação
do navegador é apenas conveniência; não é autoridade. Não há endpoint para
alterar a referência depois da criação.

A migration histórica de `system_id` ainda permite o valor `dnd35` no constraint
do banco, mas o registry da aplicação não o registra e a API rejeita novas
referências a ele. Esse valor legado não habilita D&D 3.5. Antes de restringir
ou converter eventuais linhas antigas com esse valor, é necessária uma auditoria
dos dados; esta etapa não altera nem converte campanhas existentes.

## Mapa de acoplamentos atuais

| Área | Situação atual |
| --- | --- |
| Campanhas | `campaigns.system_id` já existia. `system_version` é aditivo, com default `1.0.0`; campanhas existentes e inserts legados que omitem a coluna permanecem em D&D 2024. Criação e persistência passam por `internal/campaigns` e pelo registry. |
| Ficha e persistência | `characters.Sheet` continua sendo um tipo Go fixo e específico do formato atual. Get/save do jogador, get/save do GM, criação pelo GM e listagem resumida carregam a referência persistida da campanha e passam as regras resolvidas à normalização. Campos e JSON não são schemas selecionados pela campanha. |
| Valores derivados e descanso | As operações de normalização derivada, descanso curto e longo resolvem `campaigns.system_id/system_version` uma vez após autorizar o acesso. Modificador de atributo e proficiência são obtidos do adaptador D&D 2024; recuperação continua usando o modelo de recursos e descansos da ficha atual. |
| Rolagens da ficha | `RollSheet` carrega uma vez a referência persistida e a usa tanto para os valores derivados da ficha quanto para a rolagem autoritativa do servidor. A conjuração também resolve a referência antes de normalizar a ficha enquanto consome espaços; a regra de conjuração e escalonamento continua específica do modelo D&D atual. Payloads do cliente não fornecem a referência. |
| Rolagens de combate e cena | `scenes.RollInitiative` (iniciativa de todos os tokens, GM) e `scenes.RollTokenInitiative` (iniciativa individual autorizada) carregam `campaigns.system_id/system_version` uma vez após autorização, resolvem a referência exata no registry e usam o adaptador D&D 2024 para vantagem e rolagem d20. Referências desconhecidas falham sem fallback. Persistência do token e `combat.log` permanecem na transação existente; o evento segue pelo mecanismo realtime já associado a `game_events`. Regras de turno, efeitos e outras regras de cena continuam específicas/legadas. |
| Inventário, armas, armaduras e magias | Validações, estrutura de armas/armaduras, progressão e regras de conjuração continuam implementadas nos pacotes atuais de personagens/compêndio; a referência nesta fatia só seleciona o adaptador usado pela normalização da ficha durante esses fluxos. |
| Compêndio e combate | Entradas, regras de cena e operações de combate continuam usando os formatos e endpoints existentes de D&D 2024. A referência não altera esses contratos. |
| Interface | `CampaignHub` continua oferecendo somente D&D 2024. `CharacterSheet`, `CharacterMapSummary` e telas relacionadas continuam com layout e rótulos atuais; não são geradas a partir de schemas dinâmicos. O frontend carrega a referência da campanha para preservá-la, não para autorizar regras. |

## Abstrações introduzidas

- `systems.Ref` identifica sistema e versão; `ParseRef` rejeita versões não
  registradas em vez de trocar silenciosamente para uma versão mais nova.
- `systems.Definition` contém somente metadados descritivos/capacidades.
- `Adapter` expõe metadados. `Dnd2024CharacterRules` tem nome deliberadamente
  específico e não obriga sistemas futuros a implementar habilidades,
  proficiência ou d20. O resolver requer a referência exata; versão desconhecida
  retorna erro explícito e não cai para a versão atual.
- Fluxos de ficha e as duas operações de rolagem de iniciativa carregam a
  referência no backend após autorização e passam o contrato tipado às funções
  que executam as regras. `DefaultCharacterRules` permanece definido como
  helper de compatibilidade, mas não possui chamadas em código de produção. O
  cálculo de bônus usado ao criar tokens e as demais regras de token/cena ainda
  não foram roteados pela campanha.
- A referência não é aceita em payloads de leitura/edição da ficha. O teste de
  integração envia campos `systemId/systemVersion` forjados nos endpoints de
  save do jogador e do GM e verifica que a referência persistida não muda.

## Próxima etapa antes de adicionar outro sistema

Os próximos domínios pendentes são regras de turno/efeitos e outras regras de
cena; depois, bônus e sincronização de tokens, inventário/armas/armaduras,
regras de magia/compêndio e as projeções da ficha resumida/interface. A ficha e
suas regras continuam estruturalmente D&D 2024 mesmo quando a versão persistida
direciona as operações cobertas. Cada domínio precisa migrar com testes de
paridade antes de qualquer novo formato de ficha, compêndio, conteúdo ou
interface ser ativado. Até lá, `dnd2024@1.0.0` é uma preparação versionada, não
uma arquitetura agnóstica de ponta a ponta.
