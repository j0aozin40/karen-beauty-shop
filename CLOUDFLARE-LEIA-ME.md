# Karen Beauty Shop no Cloudflare

Esta preparação executa o servidor Express existente dentro de um Cloudflare Container e encaminha as rotas pelo Worker. O servidor continua sendo responsável pelo site, API e webhook do Mercado Pago. O Container é uma instância única para preservar o comportamento atual de sessão administrativa.

## Uso seguro: começar em homologação

O primeiro deploy deve usar `APP_ENV=homologation`, banco Supabase isolado e credenciais de teste do Mercado Pago. A configuração mantém as notificações desligadas. Não transforme esse deploy em produção apenas trocando o token.

### 1. Pré-requisitos

- Conta Cloudflare com o plano **Workers Paid** ativo. Containers também geram cobrança por uso de memória, CPU, disco, Durable Objects e Workers; confira o painel antes de novos deploys.
- Docker funcionando no ambiente usado para implantar. O Wrangler constrói a imagem localmente a partir do `Dockerfile`.
- Node.js 24 ou mais recente no Codespaces.
- O `.env.local` da homologação permanece no Codespaces e fora do Git. O `.dockerignore` evita copiá-lo para a imagem.

### 2. Preencher os valores públicos de build

No `wrangler.jsonc`, substitua os dois textos `PREENCHER_...` em `containers.images.base.build_vars` pelos valores de homologação existentes no `.env.local`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Eles são embutidos no JavaScript da vitrine porque o Vite monta o frontend durante a criação da imagem. Não coloque `SUPABASE_SECRET_KEY`, senha administrativa, Access Token ou outro segredo nessa seção.

### 3. Primeiro deploy

No **terminal do Codespaces**, na pasta raiz do projeto:

```bash
docker info
npx wrangler@latest login
npx wrangler@latest deploy
```

Se `docker info` falhar, pare aqui; não tente implantar sem o Docker ativo. O Cloudflare publica um endereço `workers.dev` após o primeiro deploy. Ainda não abra esse endereço.

### 4. Variáveis e secrets do Worker

No painel Cloudflare, abra **Workers & Pages → karen-beauty-shop → Settings → Variables and Secrets**. Configure os valores antes de abrir a vitrine ou chamar a API. As variáveis declaradas em `wrangler.jsonc` são aplicadas automaticamente; cadastre os secrets de homologação:

`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `MERCADO_PAGO_TEST_ACCESS_TOKEN`, `MERCADO_PAGO_TEST_SELLER_ID`, `MERCADO_PAGO_WEBHOOK_SECRET`, `HOMOLOGATION_SUPABASE_URL`.

Defina ainda `PUBLIC_APP_URL` como o endereço `https://...workers.dev` mostrado pelo Cloudflare. Mantenha `APP_ENV=homologation`, `NODE_ENV=production`, `PORT=8080` e `HOMOLOGATION_SEND_NOTIFICATIONS=false`. Nunca salve secrets em `wrangler.jsonc`, Git ou mensagem de chat.

### 5. Validar homologação

Após configurar secrets, abra `/api/health` e confirme HTTP 200. Depois teste o catálogo, login/logout, compra sandbox, webhook, estoque e as reservas. Só habilite notificações de homologação quando quiser enviar para os destinatários de teste autorizados.

## Migração para produção

Uma etapa separada será necessária depois de escolher o endereço público definitivo e conferir o banco de produção. Ela exige recompilar o frontend com a URL e chave publicável do Supabase de produção, mudar `APP_ENV` para `production`, configurar o Access Token e segredo de webhook de produção no Cloudflare, e validar produtos, estoque e destinatários. `PRODUCTION_SEND_NOTIFICATIONS` permanece `false` até a validação final.

O banco de homologação contém dados fictícios. Não use esse banco para pedidos reais. Este pacote apenas prepara os arquivos Cloudflare: não cria serviços, não faz deploy, não acessa bancos e não executa pagamentos.
