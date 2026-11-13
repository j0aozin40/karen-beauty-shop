# Karen Beauty Shop — variações e reservas

Revisão de 10/11/2026, feita sobre o ZIP enviado pelo proprietário. Nenhuma conexão com o banco remoto foi usada. Nenhum pedido real ou de teste foi alterado. O repositório GitHub e o Codespaces não foram modificados.

## O que mudou

- As duas migrations de 10/11 foram corrigidas. A primeira volta a instalar o gatilho de proteção do histórico. A segunda passa a ser uma única transação, incluindo tabelas, funções e permissões.
- Produtos existentes continuam no estoque geral. Variações em rascunho não mudam o controle do produto. A conversão é explícita, exige opções ativas, soma idêntica ao estoque atual e ausência de pedidos normais aguardando pagamento. Não altera estoques nem pedidos antigos automaticamente.
- Catálogo exibe opções ativas e disponibilidade descontada das reservas válidas. Carrinho distingue produto e variação, limita quantidade e envia somente IDs e quantidades. O servidor e o banco determinam preço e promoção; o cliente não define valores ou flags de teste.
- Admin cadastra e edita tipo, nome, SKU, estoque, preço, promoção, imagem HTTPS e ativação das variações. Exclusão de variações não é oferecida; desativação preserva o histórico. Estoque total de produto convertido fica somente para leitura no formulário.
- Pedido, snapshots dos itens e reserva de 30 minutos são criados em uma única operação SQL. Falha em qualquer item reverte toda a criação. Duplicação de itens não permite ultrapassar o saldo.
- A reserva não reduz estoque físico. Consultas ignoram reservas vencidas imediatamente, sem depender de agendamento. Uma linha pode continuar com status `reservada` após a validade; sua `expira_em` é a referência para disponibilidade e confirmação.
- Checkout Pro via Orders foi mantido. Expiração enviada ao provedor considera o tempo restante da reserva, com margem de 20 segundos. A chave de idempotência da criação externa é o UUID do pedido local. A URL de retorno é validada como HTTPS do Mercado Pago Brasil.
- Webhook valida HMAC, normaliza o ID para assinatura, consulta a order no provedor e confere vínculo, moeda BRL, total e total efetivamente pago. A confirmação SQL bloqueia o pedido, valida todas as reservas e baixa estoque exatamente uma vez. Eventos intermediários não regridem etapas operacionais.
- Recusa, expiração e cancelamento liberam reservas ainda não consumidas. Estorno/chargeback não devolvem mercadoria automaticamente ao estoque; exigem conferência física. Pagamento tardio, sem reserva válida ou com inconsistência fica sinalizado para revisão, sem baixa automática.
- Pedidos legados têm `usa_reservas_estoque=false`. O webhook não tenta reservar ou baixar estoque retroativamente. Pedidos com `pedido_teste=true` são ignorados pelo processamento financeiro e bloqueados nas funções de estoque e na alteração administrativa de etapa.
- O admin só avança etapas operacionais válidas. Confirmação financeira, cancelamento e estorno devem ocorrer pelo Mercado Pago. Uma sinalização de revisão aparece na lista recente e nos detalhes do pedido.
- Escritas diretas de clientes em pedidos, itens e produtos foram revogadas; as alterações passam pelo servidor. Custos acima de R$100 voltam a ser aceitos no cálculo administrativo. Sessão usa cookie seguro em produção, e o servidor atende o build do site em produção.

## Testes executados

Instalação limpa a partir do `package-lock.json` com scripts de instalação desativados. Node 24.22.1.

- `npm run build`: passou, incluindo checagem TypeScript do frontend e do servidor.
- `npm test`: 23 testes aprovados (incluindo o agrupador SQL). Testes de assinatura, URL e prazo; testes HTTP da API com Supabase/Mercado Pago simulados; e testes SQL em PostgreSQL embarcado PGlite, somente em memória.
- SQL: preservação de dados anteriores e flag de teste, permissões das RPCs, rascunhos, conversão, promoção e snapshots, disponibilidade, reserva de 30 minutos, itens duplicados, reversão atômica, pagamento repetido, recusa, cancelamento, expiração, estorno, proteção de histórico, reserva parcialmente consumida/divergente e falha no segundo produto sem baixa parcial.
- `npm run lint`: sem erros; dois avisos de atualização de estado em effects React, no carregamento do admin e das variações. Não impedem o build.
- Busca local por padrões comuns de tokens e chaves privadas: nenhuma ocorrência suspeita nos arquivos de texto da entrega. Essa busca não é uma auditoria de todo o histórico Git.

Não foram executados: migração no Supabase real, checkout com dinheiro, envio de e-mail/WhatsApp, teste visual em navegador ou ensaio com várias sessões PostgreSQL concorrentes. PGlite comprova a execução SQL e os cenários funcionais; não substitui homologação de concorrência e configuração do Supabase.

## Antes de implantar

1. Preserve a pasta atual do Codespaces e faça backup do banco, incluindo `produtos`, `pedidos`, `itens_pedido` e flags de pedidos de teste. Compare os arquivos recebidos com mudanças feitas depois do ZIP; não substitua sua pasta às cegas.
2. Rode o arquivo `supabase/preflight_variacoes.sql` apenas para inspeção, no projeto correto. Confira migrations aplicadas, colunas, restrições de status, gatilhos antigos de baixa e permissões. O arquivo `backup-seguranca/estrutura-public.sql` é somente uma referência histórica e fixture local, não um script de restauração.
3. As migrations de 10/11 desta entrega pressupõem que as versões antigas delas ainda NÃO foram aplicadas. Se já existirem tabelas, colunas ou gatilhos dessas versões, pare e prepare uma migration de atualização específica para esse estado; não remova tabelas, não apague o histórico de migrations e não execute um reset. Não se deve tornar uma instalação parcial silenciosamente aceitável com `IF NOT EXISTS` indiscriminado.
4. Homologue em uma cópia isolada do banco. Aplique primeiro `202611100001_product_variations.sql` e depois `202611100002_stock_reservations.sql`. As migrations de 08/11 e 09/11 são pré-requisitos, quando ainda não aplicadas. Confira que não existe outro gatilho/função fazendo uma segunda baixa na mudança de status.
5. Na implantação real, pause novos checkouts, faça backup e aplique as duas migrations em ordem. Não converta produtos automaticamente. As colunas novas usam valores conservadores para os pedidos anteriores; classificações de teste existentes são preservadas. Se pedidos antigos de teste não tiverem sido marcados, a classificação exige revisão explícita do proprietário, sem inferência pelo valor ou nome.
6. Configure `.env.local` a partir de `.env.example`. Somente URL e chave pública do Supabase usam prefixo `VITE_`. Token Mercado Pago, chave privada Supabase e segredo de sessão ficam no servidor. Use segredo de sessão aleatório com pelo menos 32 caracteres. Variáveis públicas precisam estar configuradas ANTES de gerar o build.
7. Na aplicação Mercado Pago, configure o tema `order` e uma URL HTTPS acessível para `/api/pagamentos/mercado-pago/webhook`, com a assinatura correspondente. O webhook é configurado no painel do provedor, não por um campo inventado no corpo da criação da order. Homologue com usuários de teste, seguindo os requisitos atuais da conta para Orders; a documentação atual informa que esse endpoint pode exigir credenciais de aplicação e usuários de teste, em vez de tokens `TEST-`. Não use o banco de produção para os ensaios de estoque.
8. Refaça os testes locais e o build:

```bash
npm ci
npm test
npm run lint
npm run build
```

Desenvolvimento, em dois terminais:

```bash
npm run server
```

```bash
npm run dev -- --host 0.0.0.0
```

Produção, em Linux/Codespaces, após configurar domínio HTTPS e proxy reverso:

```bash
NODE_ENV=production npm start
```

O processo serve `dist` e `/api` na porta 3001. O proxy deve usar um único salto confiável e encaminhar HTTPS corretamente para o cookie seguro. Hospedagem só estática não executa o servidor. Configure reinício do processo e armazenamento persistente de sessões antes de usar várias réplicas; o `MemoryStore` atual perde sessões em reinícios e não é compartilhado entre instâncias.

## Conferência na homologação

Cadastre duas variações somando exatamente o estoque de um produto, converta e compre opções diferentes. Confira preço herdado, promoção, imagem, SKU no histórico, últimas unidades e dois compradores disputando o saldo. Valide a chegada real do webhook, assinatura e nova entrega do mesmo evento. Simule atraso além de 30 minutos: pagamento tardio deve exigir revisão, sem estoque negativo ou confirmação indevida. Verifique o fluxo sem variações, recusa, cancelamento, estorno e proteção de pedidos legados/teste.

Avisos por e-mail/WhatsApp continuam sendo tentativas após a confirmação, sem fila persistente. Uma interrupção nesse momento pode impedir o envio; isso não desfaz o pagamento. Operação com garantia de reenvio requer fila/outbox e monitoramento.

Falha de rede ao criar a order é ambígua: a reserva é mantida até o vencimento e o pedido fica marcado para revisão. Não é liberada imediatamente porque o provedor pode ter recebido a criação. Falha ao salvar o vínculo externo também requer reconciliação pelo `external_reference` e UUID do pedido; não gere cobranças manuais duplicadas. O cliente não recebe URL de checkout quando o vínculo não pôde ser salvo.

Após validar backup, permissões, webhook, reserva, sessão HTTPS e estoque em homologação, libere novos checkouts. Endereços temporários de Codespaces não substituem hospedagem permanente.

## Conteúdo e preservação

A entrega contém o projeto fonte completo, configurações, migrations, testes e backups de texto recebidos. Não inclui `.env` real, `node_modules`, `dist`, cache, ZIP aninhado nem o bundle de histórico Git de `backup-seguranca`: histórico pode carregar credenciais antigas e não é necessário para executar o projeto. O ZIP original enviado permanece intacto e conserva esse bundle. Nenhuma mudança recebida foi descartada da pasta de trabalho original.

## Referências oficiais consultadas

- [Criar order Checkout Pro](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro-orders/create-order/post)
- [Consultar order](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro-orders/get-order/get)
- [Notificações e validação de assinatura](https://www.mercadopago.com.br/developers/en/docs/checkout-api-orders/notifications)
