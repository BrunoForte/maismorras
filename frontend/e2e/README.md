# Testes E2E autenticados

O GitHub Actions gera sessões novas automaticamente antes dos testes autenticados. Crie duas contas de teste dedicadas no Supabase Auth (uma narradora e uma jogadora), habilite login por e-mail/senha para essas contas e salve no GitHub:

- Variables: `E2E_SUPABASE_URL` e `E2E_SUPABASE_PUBLISHABLE_KEY` (ou a chave anon pública do projeto).
- Secrets: `E2E_GM_EMAIL`, `E2E_GM_PASSWORD`, `E2E_PLAYER_EMAIL` e `E2E_PLAYER_PASSWORD`.

As contas devem ser diferentes e usadas apenas para E2E. Não use credenciais pessoais nem a service-role key. Os estados são criados em cada execução e removidos ao final do job. Quando essas seis configurações estiverem presentes, `E2E_STORAGE_STATE_B64` e `E2E_PLAYER_STORAGE_STATE_B64` deixam de ser necessários.

Para rodar localmente, pode continuar usando arquivos `storageState` já salvos:

1. Crie uma conta de teste dedicada no Supabase.
2. Faça login manualmente em um navegador local.
3. Salve o estado com um script temporário ou pelo Playwright codegen em um arquivo fora do repositório, por exemplo `C:\\temp\\maismorras-auth.json`.
4. Execute:

```powershell
$env:E2E_STORAGE_STATE = 'C:\\temp\\maismorras-auth.json'
npm run test:e2e
```

Sem as contas automáticas ou um `E2E_STORAGE_STATE`, o smoke test público continua rodando e o fluxo autenticado é marcado como skip.

Para validar uma mesa com dois usuários, salve também um estado de um jogador e informe a URL
da cena já existente:

```powershell
$env:E2E_STORAGE_STATE = 'C:\temp\maismorras-gm.json'
$env:E2E_PLAYER_STORAGE_STATE = 'C:\temp\maismorras-player.json'
$env:E2E_SCENE_URL = 'https://maismorras.vercel.app/?campaign=<campaign-id>&scene=<scene-id>'
npx playwright test e2e/multiplayer.spec.ts
```
