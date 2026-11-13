# Revisão final — Karen Beauty Shop

Data: 12/11/2026. Base: karen-revisao-final.zip enviado pelo usuário.

**Resultado:** versão revisada com 49 testes locais aprovados, verificação de tipos aprovada e compilação aprovada. As correções desta revisão estão nos arquivos entregues; não foram instaladas automaticamente no Codespaces nem publicadas. A liberação para clientes reais continua condicionada aos itens operacionais abaixo.

## O que foi encontrado e corrigido

1. `npm test` executava apenas a suíte antiga e falhava com a configuração atual. Foram atualizados os mocks de homologação e o comando passou a incluir os dois diretórios de testes.
2. O teste de estoque dependia de um arquivo em backup-seguranca que não veio no ZIP. Agora usa um fixture próprio, somente com estrutura, incluído no projeto. Nenhum dado real foi copiado.
3. Uma resposta lenta do histórico podia terminar após logout ou troca de conta e repor pedidos da sessão anterior. As consultas agora são vinculadas à conta e à atualização mais recente; respostas antigas são descartadas.
4. O botão Enviar link novamente não fazia uma nova chamada depois do primeiro envio. O reenvio agora funciona, e o estado é limpo ao trocar de conta. Os limites do Supabase continuam valendo.
5. As rotas privadas agora retornam Cache-Control: no-store.
6. O login administrativo ganhou limite de 5 senhas erradas por origem em 15 minutos, com resposta 429 e Retry-After. A proteção é por instância e não substitui o limite da hospedagem em uma implantação distribuída.
7. Alterações em rotas privadas vindas de uma origem de navegador diferente de PUBLIC_APP_URL são recusadas. Requisições legítimas sem Origin continuam sujeitas à autenticação. A URL do site deve estar correta.
8. A produção agora exige PRODUCTION_SEND_NOTIFICATIONS=true para enviar e-mail/WhatsApp. O padrão é desligado. A homologação continua usando HOMOLOGATION_SEND_NOTIFICATIONS e a lista de destinatários. Essa mudança evita iniciar envios reais apenas por trocar APP_ENV.
9. O ZIP tem seis migrations, enquanto o banco isolado foi preparado com treze atualizações. Foi incluído um snapshot separado da preparação de homologação, com instruções para não executá-lo em bancos existentes. Não houve mudança no banco remoto.

A correção da assinatura Orders com ID original e compatibilidade histórica foi conferida e preservada, assim como a relação explícita da consulta de variações. Não há blocos MP_DIAGNOSTICO/MP_ASSINATURA de instrumentação no servidor revisado.

## Validação executada nesta revisão

- 49 testes passaram; 0 falhas, 0 cancelados, 0 ignorados.
- Cobertura: fluxos de API, assinatura original/histórica e adulterada, pagamentos parciais, reserva/estoque e repetição, bloqueio de destinatários, habilitação por ambiente, identidade do vendedor, isolamento de contas na API, resposta atrasada após logout/troca de conta, limitação de login e proteção de origem.
- TypeScript: tsc -b --force aprovado.
- Vite 8.3.6: 65 módulos, build concluído; nenhum erro de compilação.
- Sem alterações de dependências. A verificação usou as dependências locais já disponíveis e compatíveis com o projeto. Não foi realizada nova auditoria de vulnerabilidades de fornecedores.
- Serviços externos simulados; PostgreSQL em memória nos testes de estoque. Nenhuma cobrança, mensagem a clientes ou alteração de banco remoto foi executada nesta revisão.
- A proteção de estado do cliente foi testada como comportamento de consultas concorrentes; não foi executado novo teste de navegador com sessões reais após esta alteração. Retestar os passos focados abaixo após instalar.

Os logs estão em evidencias/revisao-final-testes.txt e evidencias/revisao-final-build.txt.

## Evidências funcionais anteriores, informadas pelo usuário

- Supabase isolado com dados fictícios; compra APRO confirmada e baixa física de uma unidade.
- Tentativa recusada: pagamento failed/rejected_by_issuer, order action_required/waiting_retry. Não equivale a recusa terminal; pedido aguardando foi adequado nessa etapa.
- Pagamento CONT em processamento e reserva temporária. A expiração foi antecipada apenas para uma reserva local; disponibilidade retornou ao saldo anterior. Não foi comprovada uma espera natural de 30 minutos.
- Gmail e WhatsApp recebidos em destinatários autorizados; modelo cliente com três variáveis numéricas.
- Reentrega de webhook aceita após correção da assinatura: pedido 6 confirmado, estoque informado 8, sem novas mensagens.
- Login por e-mail, logout persistente, novo login e isolamento visual: conta A viu o pedido fictício 8; conta B não o viu.
- Navegação no celular: menu/busca, produto/variação, carrinho e conta/histórico sem problemas relatados. Dispositivo/resolução não registrados.

As confirmações manuais não substituem auditoria ampla de permissões, provedores e todos os aparelhos. Consulte ANDAMENTO-HOMOLOGACAO.md e evidencias/pagamentos-externos.txt para a sequência detalhada.

## Instalar a atualização no Codespaces

Use `karen-atualizacao-final.zip` para atualizar o projeto existente. O ZIP completo é uma referência consolidada para outro checkout; não substitua seu projeto atual inteiro sem preservar suas configurações.

1. Pare a API e o Vite com Ctrl+C nos respectivos terminais.
2. Envie karen-atualizacao-final.zip à pasta /workspaces/karen-beauty-shop.
3. No terminal dessa pasta:

```bash
unzip -n karen-atualizacao-final.zip
node karen-atualizacao-final/instalar.mjs
npm test
npm run build
```

O instalador confere o conteúdo de todos os arquivos antes de alterar qualquer um. Se o código mudou desde o ZIP enviado, interrompe sem substituir as mudanças. Faz backup dos arquivos existentes em .homologacao-backups/. Não lê nem escreve .env.local, não instala dependências, não aplica SQL e não acessa a rede.

Depois inicie a API e o Vite em terminais separados:

```bash
npm run server
```

```bash
npm run dev -- --host 0.0.0.0 --port 5173
```

No Codespaces, mantenha APP_ENV=homologation, banco isolado e destinatários autorizados. Não altere para produção para contornar erros.

### Reteste focado após instalar

- Login e logout do administrador; não envie senhas repetidamente para provocar bloqueio fora do teste automático.
- Link de cliente, reenvio consciente de um link e logout/troca de conta: o histórico não deve mostrar pedidos da conta anterior.
- Confirme a loja na porta 5173, API na 3001 e a origem PUBLIC_APP_URL correspondente à loja.
- As mudanças não exigem outra compra paga para esta primeira conferência. O roteiro de reentrega já documentado pode ser repetido com o pedido fictício existente, após confirmar a sessão administrativa e o catálogo.

## Checklist para publicação — pendências abertas

- [ ] Escolher hospedagem permanente, domínio HTTPS e estratégia de API/site. O Codespaces é o ambiente de homologação deste trabalho, não uma implantação definitiva validada.
- [ ] Implementar e testar fila durável/retentativa de notificações. Hoje os envios são assíncronos após responder ao webhook: uma interrupção ou falha SMTP/Meta pode perder a mensagem e a reentrega de um pedido já confirmado não recupera o envio. Não prometer entrega garantida.
- [ ] Configurar armazenamento compartilhado de sessões administrativas para produção. O express-session ainda usa MemoryStore; reinícios encerram a sessão e múltiplas instâncias não compartilham o login.
- [ ] Validar remotamente RLS, Storage, Auth e permissões da base definitiva. O histórico da API filtra por identidade, mas isso não comprova todas as permissões do banco.
- [ ] Conferir a estrutura e o histórico de migrations do banco original antes de qualquer atualização; não executar o snapshot de homologação num banco existente.
- [ ] Validar concorrência remota de estoque, retorno ao site definitivo, encerramento terminal da order recusada e expiração pelo prazo natural.
- [ ] Preparar backup e retorno, monitoramento e limites de acesso na hospedagem.
- [ ] Configurar secrets de produção diretamente no gerenciador seguro: aplicação/vendedor Mercado Pago, assinatura do webhook, chaves Supabase, SMTP e credenciais Meta com permissões e validade adequadas. Uma variável por nome, sem duplicações.
- [ ] Ajustar no Supabase Auth a Site URL e redirects do domínio definitivo e conferir entrega SMTP e limites. Não reutilizar localhost ou o endereço temporário como configuração definitiva.
- [ ] Conferir templates e destinatário administrativo do WhatsApp. O destinatário deve ser diferente do remetente. O comprador recebe somente após pagamento confirmado e consentimento.
- [ ] Para a produção, além de APP_ENV=production e NODE_ENV=production, configurar PRODUCTION_SEND_NOTIFICATIONS=true apenas quando a implantação e os canais estiverem prontos. As variáveis TEST_* não limitam destinatários em produção. Na homologação, o novo flag de produção não habilita envios.

O bloqueio de publicação mais relevante neste momento é a confiabilidade operacional de notificações/sessões e a configuração/auditoria do ambiente definitivo. A etapa funcional documentada passou; o lançamento não foi executado.
