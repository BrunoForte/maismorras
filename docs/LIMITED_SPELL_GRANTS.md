# Usos configuráveis de magias concedidas

## Modelo

Os usos ficam junto à concessão estruturada da ficha em `actors.sheet`, não no recurso genérico nem no texto de `Spell.origin`. Cada registro possui identidade de origem estável, referência da magia, usos atuais, máximo opcional e recuperação. O narrador configura a concessão existente; a API nunca cria uma concessão com base em IDs enviados pelo cliente. Não é necessária migration porque a ficha já é JSONB e os novos campos são opcionais.

Concessões estáticas de talentos D&D 2024, regras explícitas de talentos de campanha e concessões de espécie possuem contadores independentes, ainda que apontem para a mesma magia. O jogador escolhe a fonte no botão de uso gratuito. Quando os usos gratuitos acabam, a conjuração por espaço continua disponível somente se a regra dessa fonte permite espaços; a API não troca o custo automaticamente.

Descanso curto restaura apenas fontes configuradas para curto. Descanso longo restaura fontes configuradas para curto e longo. Recuperação não aumenta o contador além do máximo guardado. Salvamentos normais preservam configuração e contador do servidor. Conjuração, gasto do contador ou espaço, evento de campanha e apresentação continuam dentro da transação existente.

## Regras estruturadas habilitadas inicialmente

- **Iniciado em Magia (Magic Initiate):** uma conjuração gratuita da magia de 1º nível, recuperada em descanso longo por padrão; a conjuração também pode usar espaços apropriados. Fonte: [D&D 2024, Feats](https://www.dndbeyond.com/sources/dnd/br-2024/feats).
- **Alto Elfo:** Detectar Magia no 3º nível e Passo Nebuloso no 5º, uma conjuração gratuita de cada magia por descanso longo e possibilidade de gastar espaços apropriados. O atributo de conjuração é escolhido na ficha entre Inteligência, Sabedoria e Carisma. Fonte: [D&D 2024, Character Origins](https://www.dndbeyond.com/sources/dnd/br-2024/character-origins).
- **Tiefling Abissal:** Raio de Enjoo no 3º nível e Imobilizar Pessoa no 5º, uma conjuração gratuita de cada magia por descanso longo e possibilidade de gastar espaços apropriados; o atributo também é escolhido. Fonte: [D&D 2024, Character Origins](https://www.dndbeyond.com/sources/dnd/br-2024/character-origins).

Para as espécies, o backend exige IDs de característica revisados e `rules.id` da magia nos registros SRD habilitados da campanha, confere nível e versão D&D 2024, e deriva a concessão da espécie/linhagem persistida. Não consulta texto localizado, nomes de magia nem `Spell.origin` para autorizar.

## Fontes não habilitadas

Drow, Elfo da Floresta, linhagens Infernal e Ctônico e Falar com Animais do Gnomo da Floresta permanecem fora do contador específico enquanto o catálogo não oferecer identidade estruturada revisada para cada característica e magia. O texto antigo e `Spell.origin=species` continuam exibíveis e não são reinterpretados como concessões gratuitas. Nenhum dado canônico do pacote SRD foi alterado nesta frente.
