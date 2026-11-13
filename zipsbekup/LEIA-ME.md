# Sessões administrativas persistentes

Este patch substitui o armazenamento temporário padrão do `express-session` por uma tabela privada do Supabase, preservando `regenerate`, `save` e `destroy` do login/logout.

## Instalar no Codespaces

1. Extraia o ZIP na raiz `/workspaces/karen-beauty-shop`.
2. No terminal do Codespaces, execute `node karen-session-persistence-patch/install.mjs`.
3. Confira que o instalador informa que copiou a migration e criou um backup.
4. Rode `npm run build` e `npm test`.

O instalador só altera `server/index.ts` e cria `server/supabase-session-store.ts` e a migration. Se os trechos esperados não coincidirem, ele para sem modificar o projeto.

## Banco

A migration `supabase/migrations/202611120001_admin_sessions.sql` cria a tabela com RLS ativada e acesso de leitura/gravação somente para `service_role`. **Ela não é executada pelo instalador.** Aplique-a apenas no projeto Supabase de homologação depois de revisar o arquivo. Não reaplique as migrations anteriores.

Depois de aplicar a migration e atualizar o Worker no Cloudflare, teste login, `/api/admin/me`, logout e novo login após reiniciar o contêiner. Não use credenciais reais de pagamento para esses testes.
