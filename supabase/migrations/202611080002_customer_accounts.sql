-- Preparar pedidos para vincular, opcionalmente, a uma conta de cliente.
-- Pedidos existentes e compras como convidado permanecem sem cliente_id.
begin;

alter table public.pedidos
  add column if not exists cliente_id uuid null
  references auth.users(id) on delete set null;

create index if not exists pedidos_cliente_id_criado_em_idx
  on public.pedidos (cliente_id, criado_em desc);

commit;
