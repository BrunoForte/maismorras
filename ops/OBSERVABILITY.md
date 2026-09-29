# Observabilidade do MaisMorras

O backend escreve uma linha JSON por evento em `stdout`. No Cloud Run, os campos
`severity` e `message` são reconhecidos pelo Cloud Logging; `level` permanece
disponível para consumidores compatíveis com `slog`. O campo `cloud_run_revision`
identifica a revisão e `service` identifica o serviço.

## Campos e eventos

Cada requisição HTTP registra `event=http.request.completed`, `request_id`,
`method`, `route` (padrão do `ServeMux`, nunca o caminho bruto), `status`,
`duration_ms` e `response_bytes`. Quando o valor do caminho é um UUID válido,
`campaign_id` e/ou `scene_id` também são registrados. `X-Request-ID` aceita UUID
RFC válido; valores ausentes ou inválidos são substituídos por um UUID v4. O
identificador é devolvido no cabeçalho `X-Request-ID` e, nos erros da API, em
`error.request_id`. Se Cloud Run enviar `X-Cloud-Trace-Context` e o projeto
estiver disponível em `GOOGLE_CLOUD_PROJECT` ou `GCP_PROJECT`, a linha inclui
`logging.googleapis.com/trace` para correlação nativa com a entrada da requisição.

Eventos do broker PostgreSQL usam `realtime.broker.*`: `initialized`,
`listener_connected`, `connected`, `connection_failed`, `disconnected`,
`degraded`, `reconnected`, `publish_failed`, `publish_succeeded` e
`receive_failed`. Incluem modo, ID técnico da instância, estado, tentativa e/ou
código/classe do erro quando aplicável. Payloads realtime, URL/credenciais do
banco, cabeçalhos de autenticação, cookies, JWTs, senhas, e-mails e IPs não são
registrados. Falhas de recebimento incluem somente motivo e tamanho do envelope.

`/health` continua liveness simples. `/health/ready` continua respondendo 503
antes da primeira conexão do listener PostgreSQL; depois da primeira conexão,
responde 200 tanto conectado quanto degradado, para evitar ciclos de reinício no
Cloud Run durante indisponibilidade temporária do broker.

## Consultas no Logs Explorer

Substitua `maismorras-api` pelo nome real do serviço, se necessário.

Requisições 5xx:

```text
resource.type="cloud_run_revision"
resource.labels.service_name="maismorras-api"
jsonPayload.event="http.request.completed"
jsonPayload.status>=500
```

Latência alta (comece inspecionando picos acima de 1 s):

```text
resource.type="cloud_run_revision"
resource.labels.service_name="maismorras-api"
jsonPayload.event="http.request.completed"
jsonPayload.duration_ms>=1000
```

Falhas de readiness:

```text
resource.type="cloud_run_revision"
resource.labels.service_name="maismorras-api"
jsonPayload.event="http.request.completed"
jsonPayload.route="GET /health/ready"
jsonPayload.status=503
```

Transições/falhas do broker:

```text
resource.type="cloud_run_revision"
resource.labels.service_name="maismorras-api"
jsonPayload.event=~"realtime.broker.(connection_failed|disconnected|degraded|reconnected|publish_failed|receive_failed)"
```

Correlacione mensagens de frontend e backend pelo `request_id`. Para uma sessão
WebSocket, filtre por `route="GET /api/v1/ws"` e pelo `scene_id` técnico; a
requisição é registrada quando a conexão termina.

## Métricas e alertas recomendados

Não foram criados recursos no GCP. Para métricas baseadas em logs, use filtros
pelos eventos acima e mantenha dimensões de baixa cardinalidade (`service`,
`route`, `status`, `broker_mode`, `event`). `campaign_id` e `scene_id` são úteis
para investigação em logs, mas não devem ser rótulos de métricas: isso cria alta
cardinalidade e custo imprevisível.

- Taxa de respostas 5xx: alerta inicial se exceder 5% por 5 minutos, com um
  mínimo de 20 requisições no intervalo para reduzir falsos positivos.
- Latência: distribuição de `duration_ms` e p95 por rota; alerta inicial se p95
  exceder 1.000 ms por 10 minutos. Ajuste após observar uma semana de baseline.
- Readiness: alerta se houver três ou mais respostas 503 em 2 minutos; confirme
  que é falha antes da primeira conexão do broker, não estado degradado posterior.
- Broker: alerta se `degraded` permanecer por mais de 2 minutos ou se houver
  falhas repetidas de conexão/publicação; uma reconexão isolada deve ser apenas
  investigada, não paginada.

## Diagnóstico

1. **Backend indisponível:** primeiro verifique `/health` e, separadamente,
   `/health/ready`. No Logs Explorer, filtre o serviço, revisão e janela de
   tempo; use `request_id` para localizar a requisição e compare `status`,
   `duration_ms` e `route`. Confirme se há revisão pronta antes de atribuir a
   falha à aplicação.
2. **Broker degradado:** procure o último `realtime.broker.connected`, seguido
   por `degraded`/`disconnected`, depois `connection_failed` e `reconnected`.
   O `postgres_error_code`, `error_type`, `retry_ms`, modo e ID da instância
   ajudam a distinguir rede, conexão e indisponibilidade do PostgreSQL sem
   expor a URL. Readiness permanece 200 após uma conexão inicial, por projeto.
3. **401/403:** correlacione pelo `request_id` e valide rota e status. 401 aponta
   principalmente para autenticação ausente/inválida; 403 aponta para decisão de
   autorização (membro, papel, campanha/cena). Os logs deliberadamente não
   contêm JWT, e-mail ou cabeçalhos; valide a sessão do usuário e a associação
   no Supabase usando ferramentas autorizadas, sem copiar tokens para logs.

Os valores sugeridos são um ponto de partida, não SLOs. Revise-os depois de
observar tráfego real e o custo de ingestão/retensão antes de habilitar métricas
ou alertas no projeto.
