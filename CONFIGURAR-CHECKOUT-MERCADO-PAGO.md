# Checkout Mercado Pago

O fluxo atual usa Checkout Pro via Orders, com reserva local de estoque por 30 minutos e confirmação somente após consulta autenticada ao Mercado Pago.

Siga o guia completo atualizado em [IMPLANTACAO-VARIACOES-RESERVAS.md](IMPLANTACAO-VARIACOES-RESERVAS.md), incluindo as duas migrations de 10/11, inspeção prévia do banco, credenciais, webhook, homologação e publicação. Não execute somente a migration de 09/11: ela não contém o controle de reservas.

Pedidos legados e de teste são preservados. Pagamentos tardios ou inconsistentes exigem revisão manual. Não aplique migrations no banco real antes da homologação e do backup.
