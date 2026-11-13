-- Adds per-product cost and pricing estimate inputs.
-- Columns are nullable and have no defaults, so existing product rows and prices remain untouched.
begin;

alter table public.produtos
  add column if not exists custo_aquisicao numeric(12, 2),
  add column if not exists custo_adicional numeric(12, 2),
  add column if not exists taxa_mp_percentual numeric(6, 3),
  add column if not exists taxas_adicionais_percentual numeric(6, 3),
  add column if not exists margem_desejada_percentual numeric(6, 3);

comment on column public.produtos.custo_aquisicao is 'Custo unitário de compra informado pelo administrador.';
comment on column public.produtos.custo_adicional is 'Custos fixos unitários adicionais, como embalagem.';
comment on column public.produtos.taxa_mp_percentual is 'Percentual de tarifa Mercado Pago usado apenas para estimativa.';
comment on column public.produtos.taxas_adicionais_percentual is 'Outras taxas percentuais usadas apenas para estimativa.';
comment on column public.produtos.margem_desejada_percentual is 'Margem líquida desejada sobre o preço de venda.';

commit;
