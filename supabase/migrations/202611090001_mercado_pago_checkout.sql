-- Adds payment metadata and the WhatsApp opt-in without changing existing rows.
begin;

alter table public.pedidos
  add column if not exists mercado_pago_order_id text,
  add column if not exists mercado_pago_status text,
  add column if not exists aceita_whatsapp boolean not null default false;

create unique index if not exists pedidos_mercado_pago_order_id_uidx
  on public.pedidos (mercado_pago_order_id)
  where mercado_pago_order_id is not null;

commit;
