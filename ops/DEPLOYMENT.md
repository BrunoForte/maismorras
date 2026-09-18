# Publicação de produção

O workflow `.github/workflows/ci.yml` publica automaticamente depois que os jobs de backend e frontend passam em um push para `main`. A ordem é deliberada:

1. validação do backend e frontend;
2. redeploy da API no Cloud Run;
3. verificação de `/health`;
4. build prebuilt e publicação do frontend na Vercel.

As migrations do Supabase são publicadas pela integração GitHub do próprio Supabase. Não mantenha simultaneamente um segundo deploy de migrations pelo GitHub Actions, pois isso pode gerar concorrência entre os dois processos.

## Secrets necessários no GitHub

Em **Settings → Secrets and variables → Actions**, cadastre:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`: recurso do provedor OIDC do Google Cloud;
- `GCP_SERVICE_ACCOUNT`: service account autorizada a fazer deploy no Cloud Run;
- `GCP_PROJECT_ID`: ID do projeto Google Cloud;
- `VERCEL_TOKEN`: token de deploy da Vercel;
- `VERCEL_ORG_ID`: ID da organização/conta Vercel;
- `VERCEL_PROJECT_ID`: ID do projeto Vercel.

O pipeline usa Workload Identity Federation no Google Cloud, portanto não é necessário salvar uma chave JSON de service account no GitHub. A configuração atual do serviço no Cloud Run, incluindo os secrets já existentes do Secret Manager, é preservada porque o comando de deploy não substitui variáveis não informadas.

Para testar manualmente sem fazer push, use a ação **Run workflow** em `main`. O deploy automático só ocorre em pushes para `main`; pull requests executam apenas validação.
