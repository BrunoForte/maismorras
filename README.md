# maismorras

## Produção

O backend publicado usa o endpoint de saúde `/health` (não `/healthz`, que pode ser
interceptado pelo frontend do Cloud Run). O smoke test valida a saúde da API e o
proxy de geração sem imprimir a imagem Base64:

```powershell
& .\ops\smoke-api.ps1
```

Para testar outra implantação:

```powershell
& .\ops\smoke-api.ps1 -ApiBaseUrl "https://seu-servico.run.app"
```

Segredos devem ser fornecidos pelo Secret Manager/Cloud Run ou pelo ambiente local;
nenhum segredo deve ser versionado no Git.
