# Custos e preço sugerido por produto

Na edição de cada produto, a loja calcula um preço sugerido e o lucro líquido estimado por unidade usando:

- custo de compra;
- custos fixos adicionais por unidade (por exemplo, embalagem);
- taxa percentual do Mercado Pago;
- outras taxas percentuais;
- margem líquida desejada.

O campo **Preço** continua sendo o preço final cobrado na loja. O botão **Aplicar preço sugerido** copia a sugestão para esse campo, que ainda pode ser editado manualmente.

## Instalação

1. Faça uma cópia de segurança de `src/Admin.tsx` e `server/index.ts`.
2. Substitua esses dois arquivos pelos arquivos do pacote, preservando os demais arquivos e o `.env.local`.
3. No Supabase SQL Editor, revise e execute `supabase/migrations/202611090002_product_pricing_fields.sql`. A migração só adiciona colunas opcionais; não atualiza nem substitui linhas ou preços existentes.
4. Reinicie os servidores e abra a edição de um produto. Preencha os custos e as tarifas antes de usar o preço sugerido.

## Como informar a taxa

Use a maior tarifa aplicável ao método e prazo de recebimento que pretende oferecer, conforme a tabela da sua própria conta Mercado Pago. A tarifa real pode variar conforme pagamento, parcelamento e prazo de recebimento; o cálculo do site é uma estimativa e não consulta a tarifa da transação em tempo real. Inclua em **Taxas adicionais** outros custos percentuais que queira considerar.

Produtos existentes começam sem custo registrado. O sistema não altera os produtos antigos durante a migração; os valores passam a ser gravados apenas quando você salvar cada produto. A estimativa não inclui frete, impostos ou custos não preenchidos.
