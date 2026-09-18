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

Para validar uma mesa com dois usuários, salve também um estado de um jogador e informe a URL
da cena já existente:

```powershell
$env:E2E_STORAGE_STATE = 'C:\temp\maismorras-gm.json'
$env:E2E_PLAYER_STORAGE_STATE = 'C:\temp\maismorras-player.json'
$env:E2E_SCENE_URL = 'https://maismorras.vercel.app/?campaign=<campaign-id>&scene=<scene-id>'
npx playwright test e2e/multiplayer.spec.ts
```
