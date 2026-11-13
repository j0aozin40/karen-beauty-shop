# Avisos por e-mail de pedidos

Esta etapa envia um resumo do pedido ao cliente e um aviso à loja depois que o pedido e seus itens forem salvos. Se o envio do e-mail falhar, o pedido continua registrado. As credenciais são usadas somente pelo servidor e não devem ser colocadas no código do site nem compartilhadas no chat.

## Configuração no Codespaces

1. No terminal do Codespaces, rode `npm install` para instalar o envio de e-mail e atualizar o `package-lock.json`.
2. Abra `.env.local` pelo VS Code. Não apague as outras variáveis que já estão lá.
3. Acrescente estas linhas, usando o mesmo Gmail e a mesma Senha de app usados nas configurações SMTP do Supabase:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu-gmail@gmail.com
SMTP_PASS=sua-senha-de-app-do-google
SMTP_FROM_EMAIL=seu-gmail@gmail.com
ORDER_NOTIFICATION_EMAIL=seu-gmail@gmail.com
```

`ORDER_NOTIFICATION_EMAIL` é onde a loja recebe os avisos. Pode ser outro e-mail; nesse caso, substitua somente esse endereço.

4. Salve `.env.local` e reinicie `npm run server`. Não é necessário reiniciar o site para carregar essas variáveis.
5. Para conferir, faça um pedido enquanto conectado. O pedido será gravado de verdade com status **aguardando pagamento**, e o sistema tentará enviar um e-mail ao cliente e outro à loja.

Não envie capturas que revelem o valor de `SMTP_PASS`. O arquivo `.env.local` não deve ser incluído no ZIP nem enviado ao GitHub.

## WhatsApp

Os avisos por WhatsApp ainda não estão configurados. Para isso será preciso preparar o WhatsApp Business Platform/Cloud API e guardar as credenciais no servidor; nunca no navegador ou no repositório.
