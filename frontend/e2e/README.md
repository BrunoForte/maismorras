# Testes E2E autenticados

Os testes autenticados usam um `storageState` do Playwright. Nunca coloque tokens, cookies ou credenciais no Git.

1. Crie uma conta de teste dedicada no Supabase.
2. Faça login manualmente em um navegador local.
3. Salve o estado com um script temporário ou pelo Playwright codegen em um arquivo fora do repositório, por exemplo `C:\\temp\\maismorras-auth.json`.
4. Execute:

```powershell
$env:E2E_STORAGE_STATE = 'C:\\temp\\maismorras-auth.json'
npm run test:e2e
```

Sem `E2E_STORAGE_STATE`, o smoke test público continua rodando e o fluxo autenticado é marcado como skip.
