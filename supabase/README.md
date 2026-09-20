# Migrations do banco

A fonte canônica de schema e políticas de produção é `supabase/migrations/`. A integração GitHub do Supabase aplica esses arquivos em ordem cronológica.

`backend/migrations/` é o histórico legado do primeiro protótipo e permanece versionado apenas para auditoria. Não adicione novas migrations nessa pasta. Alterações futuras devem usar `supabase migration new` (ou o fluxo de pull da CLI) e incluir RLS, grants e testes correspondentes.