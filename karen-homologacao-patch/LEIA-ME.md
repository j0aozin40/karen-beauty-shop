# Atualização do backend recebido — homologação

Esta atualização foi adaptada ao server/index.ts enviado no ZIP pelo usuário. Preserva a lógica existente de produtos, preços, pedidos e painel. Não inclui package.json, dependências, migrations, frontend, .env.local ou dados do banco.

## Instalar no Codespaces

1. Pare o servidor com Ctrl+C.
2. Envie karen-homologacao-patch.zip para /workspaces/karen-beauty-shop.
3. No terminal da pasta do projeto:

```bash
unzip -n karen-homologacao-patch.zip
node karen-homologacao-patch/install.mjs
node --env-file=.env.local --experimental-strip-types scripts/check-homologation.ts
```

O instalador verifica se server/index.ts ainda corresponde ao arquivo enviado para revisão. Se mudou, interrompe sem alterar arquivos. Envie a versão atual para adaptar a correção; não remova a verificação. O backup dos arquivos de código existentes fica em .homologacao-backups/. O instalador não lê ou grava .env.local, nem acessa a rede ou banco.

Arquivos instalados: server/index.ts, server/homologation.ts, scripts/check-homologation.ts e dois testes em homologation-tests/. Só estes caminhos são escritos.

## Pendências de configuração

APP_ENV deve ser homologation. Mantenha HOMOLOGATION_SEND_NOTIFICATIONS=false.

Configure MERCADO_PAGO_TEST_ACCESS_TOKEN e MERCADO_PAGO_TEST_SELLER_ID diretamente no arquivo protegido do servidor ou no gerenciador de secrets, nunca no chat. A credencial precisa ser do ambiente Teste da aplicação Mercado Pago e o ID precisa corresponder à conta vendedora de teste brasileira. O servidor consulta /users/me e bloqueia se a identidade, país MLB ou tag test_user não corresponderem. Essa consulta precisa ser validada com a conta externa; nenhum token real foi usado nos testes locais. O prefixo APP_USR também pode existir em credenciais de teste; não determina o ambiente.

Crie ou confirme um projeto Supabase separado, com dados fictícios, para a homologação. Configure as chaves desse projeto em VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY e SUPABASE_SECRET_KEY, e confirme sua URL em HOMOLOGATION_SUPABASE_URL. Não copie a URL do banco existente apenas para passar na verificação. A igualdade das URLs é uma confirmação administrativa, não comprova o isolamento real.

ATENÇÃO: o novo servidor bloqueia a inicialização em homologação se HOMOLOGATION_SUPABASE_URL estiver ausente ou diferente de VITE_SUPABASE_URL. Isto é esperado até concluir a configuração do banco isolado. Não mude APP_ENV para production para contornar a trava. O verificador pode ser executado sem iniciar o servidor.

Depois de concluir a configuração e revisar todas as pendências:

```bash
npm run server
```

Somente após validar credenciais de teste e isolamento será possível iniciar compras simuladas. Não foi executado pagamento ou envio externo nesta entrega.

## Validação

- 11 testes incluídos no pacote passaram: credencial dedicada, identificação de vendedor, banco declarado, destinatários, reserva, recusa, pendência, assinatura de webhook, valor parcial e notificações simuladas.
- 28 testes de regras de pagamento/homologação e estoque passaram no projeto de apoio, usando PostgreSQL em memória (incluem cenários sobrepostos aos testes do pacote).
- Verificação TypeScript passou usando o restante dos arquivos do projeto local de apoio. O usuário enviou somente backend e package.json, portanto não se afirma que o frontend e a suíte completa do Codespaces tenham sido revalidados.
- Instalador testado: cópia correta, backup, preservação do arquivo de ambiente e rejeição de código alterado.

Para repetir os testes do pacote (não leem .env.local; SMTP, Meta, Supabase e Mercado Pago são simulados):

```bash
node --experimental-strip-types --test homologation-tests/*.test.ts
```

Os testes legados existentes em tests/ não foram modificados. Testes antigos da API podem precisar de atualização das variáveis e mocks para as novas proteções. Não há alteração do script npm test.

## Limites que continuam pendentes

- Checkout externo APRO, recusa e CONT; webhook assinado e painel no Supabase isolado.
- Compatibilidade do retorno real de /users/me com a conta de teste.
- Entrega Gmail/WhatsApp a destinatários autorizados e confirmação de templates.
- Fila durável/retry de notificações: o código continua enviando após responder ao webhook, sem persistência para retentativa de SMTP/Meta. Uma falha posterior não é recuperada automaticamente.
- Somente pagamentos aprovados disparam notificações; mensagens de pendência/cancelamento ainda não estão implementadas.
- A sessão administrativa continua em memória, exigindo revisão antes de produção.

A loja não está liberada para publicação por esta atualização.
