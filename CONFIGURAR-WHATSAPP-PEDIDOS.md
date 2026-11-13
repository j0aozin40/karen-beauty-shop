# WhatsApp para avisos de pedidos

O servidor pode enviar um modelo de mensagem aprovado pela Meta para a loja em cada pedido. O cliente só recebe WhatsApp se marcar a autorização opcional no checkout. O pedido continua salvo mesmo se o envio do WhatsApp falhar.

## Antes do envio funcionar

1. Crie e aguarde a aprovação de dois modelos na conta WhatsApp Business Platform. Use o idioma `Português (Brasil)` e a categoria **Utility/Utilidade**.

   **Nome:** `karen_novo_pedido`

   **Texto:** `Novo pedido {{1}} na Karen Beauty Shop. Cliente: {{2}}. WhatsApp: {{3}}. Itens: {{4}}. Total: {{5}}.`

   **Nome:** `karen_confirmacao_pedido`

   **Texto:** `Olá {{1}}! Recebemos seu pedido {{2}}, no valor de {{3}}. A Karen Beauty Shop entrará em contato em breve.`

   Ao enviar cada modelo para análise, informe exemplos para os espaços `{{1}}`, `{{2}}` e assim por diante.

2. No `.env.local` do Codespaces, acrescente as variáveis abaixo. Preserve todas as outras variáveis que já estão no arquivo:

```env
WHATSAPP_ACCESS_TOKEN=token_atual_do_meta
WHATSAPP_PHONE_NUMBER_ID=id_do_numero_fornecido_pela_meta
WHATSAPP_API_VERSION=v25.0
WHATSAPP_TEMPLATE_LANGUAGE=pt_BR
WHATSAPP_ORDER_RECIPIENT=+55DDDNUMERODALOJA
WHATSAPP_ORDER_STORE_TEMPLATE=karen_novo_pedido
WHATSAPP_ORDER_CUSTOMER_TEMPLATE=karen_confirmacao_pedido
```

`WHATSAPP_ORDER_RECIPIENT` é o número do WhatsApp que receberá os pedidos da loja. Use o código do país e DDD. O token fica apenas no servidor; nunca o publique, envie no chat ou coloque no código do navegador. Tokens temporários da Meta são apenas para desenvolvimento e expiram; gere um token de produção seguro quando a integração for aprovada.

3. Reinicie `npm run server` depois de salvar o arquivo.

## Restrição atual da Meta

O teste atual retornou o erro `130497`: a conta WhatsApp Business está restrita para mensagens destinadas a determinados países. O código do site não consegue remover essa restrição. A Meta precisa liberar o envio para o Brasil; até lá, o e-mail continua funcionando e os pedidos permanecem registrados.

Não repita pedidos só para testar enquanto a Meta não resolver a restrição: cada tentativa de compra grava um pedido real no banco. Quando o envio estiver liberado, mensagens de clientes só serão enviadas se a pessoa marcar a autorização no checkout.
