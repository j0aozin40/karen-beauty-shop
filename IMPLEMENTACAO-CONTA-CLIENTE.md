# Conta do cliente e histórico de pedidos

Esta versão adiciona login opcional por link enviado ao e-mail e uma área para o cliente consultar seus próprios pedidos. A compra como convidado continua disponível. Pedidos antigos e pedidos feitos sem login não são alterados nem vinculados automaticamente.

## Antes de substituir os arquivos do site

1. No Supabase, abra **SQL Editor** e crie uma consulta nova.
2. Copie o conteúdo de `supabase/migrations/202611080002_customer_accounts.sql`, cole e clique em **Run** uma vez. Não precisa clicar em **Save** para executar. A alteração só acrescenta um campo opcional aos pedidos; não modifica os produtos nem os pedidos existentes.
3. No Supabase, em **Authentication > URL Configuration**, inclua o endereço atual do site de teste e o endereço público final na lista de URLs permitidas. O link de login retorna ao endereço que a pessoa estava usando.
4. Substitua os arquivos do projeto pela versão deste pacote e faça o build normalmente.

## E-mail de login

O login usa um link de acesso do Supabase Auth. O envio padrão do Supabase serve para testes e pode aceitar somente endereços autorizados da equipe. Para clientes reais, configure um servidor SMTP próprio em **Authentication > SMTP Settings** antes de divulgar a criação de contas. Não coloque senha ou chave SMTP no código do site; configure tudo no painel do Supabase.

Os avisos de compra por e-mail e WhatsApp para a loja ainda não estão ativados. Eles serão uma etapa separada, quando os canais comerciais forem configurados.
