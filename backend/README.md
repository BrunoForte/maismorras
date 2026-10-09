# Custom VTT Backend

Backend do Virtual Tabletop escrito em Go. A escolha favorece o próximo passo do produto: Go combina goroutines leves, runtime estável e um servidor HTTP/WebSocket eficiente, mantendo menor pressão de memória quando várias mesas e eventos em tempo real estiverem ativos. O proxy atual é deliberadamente um módulo isolado, pronto para coexistir com futuros módulos de salas, estado e WebSockets.

## Núcleo multiplayer V1

> As migrations de produção agora vivem em `../supabase/migrations`. A pasta `backend/migrations` é somente histórica e não deve receber novos arquivos.

O modelo de dados base e as evoluções estão em `../supabase/migrations`, prontas para Supabase/PostgreSQL. Aplique-as pela integração do projeto com o Supabase (ou pelo pipeline de migrations), preservando a ordem e o histórico:

- `profiles`: identidade proveniente do Google Auth/Supabase;
- `campaigns` e `campaign_members`: uma campanha possui um GM e jogadores;
- `actors`: fichas de personagem e NPCs; há uma restrição de uma ficha de jogador por usuário por campanha;
- `notes`: anotações privadas do GM ou compartilhadas;
- `game_events`: trilha persistente para movimentos, rolagens e eventos de mesa.

Aplique as migrations pelo fluxo oficial do Supabase antes de conectar os módulos protegidos. Nunca exponha `SUPABASE_JWT_SECRET` ou a Service Role Key ao frontend. A camada `internal/auth` valida o JWT recebido do Supabase e a camada `internal/database` abre um pool PostgreSQL com `DATABASE_URL`.

### Política de migrations

Migrations já aplicadas são imutáveis: não renomeie, mova ou edite arquivos que já chegaram ao Supabase. O histórico atual contém os prefixos duplicados `0018` e `0019`, preservados por compatibilidade. Novas migrations devem usar um prefixo numérico único; o CI executa `scripts/check-migration-prefixes.mjs` para bloquear novos conflitos.

## Estrutura

```text
cmd/api/                 ponto de entrada e ciclo de vida do servidor
internal/config/         configuração por ambiente
internal/http/           roteamento e middlewares globais
internal/apperror/       formato centralizado de erros HTTP
internal/tokens/         handler e serviço do proxy Pollinations
```

## Executar localmente

Requer Go 1.27.2+.

```bash
go run ./cmd/api
```

O servidor estará em `http://localhost:8080`. Para gerar uma imagem:

```bash
curl "http://localhost:8080/api/v1/tokens/gerar?prompt=elfa%20arqueira"
```

O CORS permite por padrão `http://localhost:5173`. Copie `.env.example` para seu gerenciador de variáveis de ambiente, se quiser alterar origem, timeout ou limite de imagem.

## Testes

```bash
go test ./cmd/... ./internal/...
go vet ./cmd/... ./internal/...
```

Os testes unitários do módulo `tokens` simulam o servidor de imagens: validam o prompt e seus parâmetros, o `User-Agent`, a codificação Base64, falhas `5xx` do upstream e o limite de bytes em memória.

## Realtime entre instâncias

O `Hub` mantém somente os WebSockets locais à instância. Em produção, configure `REALTIME_BROKER=postgres`; em desenvolvimento/testes, `local` mantém o fan-out no processo. O serviço recusa iniciar no Cloud Run sem um modo explicitamente configurado.

`GET /health` continua sendo liveness e responde apenas se o processo HTTP está vivo. `GET /health/ready` é readiness: no modo local fica pronto imediatamente; no modo PostgreSQL retorna `503 {"status":"not_ready","realtime":"starting"}` até o primeiro `LISTEN` conectar. Depois disso, uma interrupção transitória retorna `200` com `realtime: "degraded"` e volta a `connected` após reconectar. Essa política evita retirar/reiniciar simultaneamente instâncias enquanto o broker tenta se recuperar; o processo ainda aceita tráfego degradado e o frontend faz reconciliação REST após reconexão.

`REALTIME_BROKER_DATABASE_URL` deve apontar para uma conexão PostgreSQL persistente compatível com `LISTEN`: Supabase Direct ou Session Pooler na porta `5432`. Não use o Transaction Pooler (`6543`). Se a variável dedicada estiver vazia, o backend reutiliza `DATABASE_URL` somente quando a URL passa essa validação. Recomendamos manter a URL do listener separada quando `DATABASE_URL` for destinada ao tráfego normal. A conexão `pgx.Conn` do listener é exclusiva para `LISTEN`; publicação usa `pg_notify` pelo pool de requisições. O listener reconecta com backoff e sua falha transitória não interrompe a API.

Cada instância da API mantém uma conexão persistente extra para `LISTEN`. Antes de ativar o modo distribuído, confira o limite de conexões do Supabase junto do máximo de instâncias configurado no Cloud Run; não compartilhe a URL de conexão no frontend.

O broker só recebe eventos minimizados depois da validação de autorização. Atualizações de token permanecem invalidações sem ficha/imagem/atributos; conteúdo de apresentação continua protegido pelo endpoint REST com permissões. Eventos remotos nunca são republicados e eventos grandes viram `scene.refresh`.

### Operação

- No Cloud Logging, filtre `resource.type="cloud_run_revision"` e procure `realtime broker listener connected`, `realtime broker listener interrupted`, `realtime broker listener connection failed` e `realtime broker publication failed`.
- Investigue se o listener alterna repetidamente entre conexão/falha ou se `retry_ms` chega ao teto de 30 s; confira disponibilidade do Supabase, senha/host/porta da URL dedicada e se a conexão usa modo sessão/direct.
- `broker_mode`, `origin_instance_id`, `scene_id`, `event_id` e `outcome` permitem seguir a publicação sem expor tokens. `local_peer_count` aparece somente em logs `DEBUG` e não inclui dados pessoais; para habilitá-lo temporariamente, configure `LOG_LEVEL=debug` no serviço e retorne a `info` após o diagnóstico.
- Uma indisponibilidade do broker não derruba o Cloud Run, mas clientes conectados a instâncias diferentes podem ficar temporariamente divergentes; após reconexão, o frontend invalida uma vez a cena compartilhada e carrega novamente a fonte de verdade REST.
- `realtime broker readiness established`, `readiness degraded` e `readiness recovered` registram as transições sem JWT ou credenciais. Alertas recomendados: primeira prontidão não atingida após alguns minutos, degradação contínua acima de 2–5 minutos e aumento sustentado de falhas de publicação. Correlacione por `cloud_run_revision`, `service` e `origin_instance_id`.
- Para usar as rotas como probes no Cloud Run, mantenha startup/liveness em `/health` e, se optar pela readiness probe HTTP (atualmente em Preview), use `/health/ready`, na porta do container. Configure na revisão do Cloud Run; este código não altera infraestrutura. O Cloud Run pode encaminhar tráfego antes da primeira leitura de readiness: REST permanece disponível, mas o fan-out cross-instance aguarda o primeiro `LISTEN`. A resposta JSON não expõe host, URL, credenciais nem estado de sessão. Consulte a [documentação oficial de health checks](https://docs.cloud.google.com/run/docs/configuring/healthchecks).
- Os testes de integração PostgreSQL usam `REALTIME_TEST_DATABASE_URL` para validar `pg_notify` entre conexões independentes e o fan-out entre dois hubs/listeners, incluindo cancelamento e ausência de eco. Eles não alteram tabelas. O CI executa o teste de fan-out contra o Postgres local iniciado pelo Supabase CLI (`127.0.0.1:54322`); localmente, sem essa variável, os testes de integração são ignorados.

## Docker

```bash
docker build -t vtt-api .
docker run --rm -p 8080:8080 -e CORS_ORIGIN=http://localhost:5173 vtt-api
```

O Dockerfile faz o build em estágio separado e executa somente o binário estático com usuário sem privilégios.
