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

Requer Go 1.25.8+.

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

## Docker

```bash
docker build -t vtt-api .
docker run --rm -p 8080:8080 -e CORS_ORIGIN=http://localhost:5173 vtt-api
```

O Dockerfile faz o build em estágio separado e executa somente o binário estático com usuário sem privilégios.
