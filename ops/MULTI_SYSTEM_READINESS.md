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
| Ficha e persistência | `characters.Sheet` continua sendo um tipo Go fixo e específico do formato atual. Campos e JSON de ficha não são schemas selecionados pela campanha. |
| Valores derivados e descanso | `characters/rules.go` e `characters/rests.go` contêm fórmulas e comportamentos diretamente ligados ao modelo atual. Ainda chamam o adaptador d20 padrão, sem receber a referência da campanha. |
| Rolagens de ficha e combate | `characters/repository.go`, `scenes/combat.go` e `scenes/tokens.go` ainda usam o helper padrão D&D 2024. O contrato tipado preserva paridade, mas essas operações ainda não resolvem por `campaign.system_id/system_version`. |
| Inventário, armas, armaduras e magias | Validações, estrutura de armas/armaduras, progressão e conjuração continuam implementadas nos pacotes atuais de personagens/compêndio; não são direcionadas pelo registry nesta fatia. |
| Compêndio e combate | Entradas, regras de cena e operações de combate continuam usando os formatos e endpoints existentes de D&D 2024. A referência não altera esses contratos. |
| Interface | `CampaignHub` continua oferecendo somente D&D 2024. `CharacterSheet`, `CharacterMapSummary` e telas relacionadas continuam com layout e rótulos atuais; não são geradas a partir de schemas dinâmicos. O frontend carrega a referência da campanha para preservá-la, não para autorizar regras. |

## Abstrações introduzidas

- `systems.Ref` identifica sistema e versão; `ParseRef` rejeita versões não
  registradas em vez de trocar silenciosamente para uma versão mais nova.
- `systems.Definition` contém somente metadados descritivos/capacidades.
- `Adapter` expõe metadados; `ResolveD20CharacterRules` é a fronteira tipada e
  específica do domínio que existe hoje. Não existe dispatcher genérico de
  operações nem engine de regras configurável por usuário.
- `DefaultCharacterRules` permanece apenas como compatibilidade para os caminhos
  legados que ainda não carregam `campaign.Ref`.

## Próxima etapa antes de adicionar outro sistema

Carregar a referência persistida junto ao contexto da campanha e passá-la pelas
operações de ficha, valores derivados, descanso, rolagens, token/iniciativa e
combate. Cada domínio deve migrar com testes de paridade antes de qualquer novo
formato de ficha, compêndio, conteúdo ou interface ser ativado. Até essa migração,
`dnd2024@1.0.0` é uma preparação versionada, não uma arquitetura agnóstica de
ponta a ponta.
