begin;

-- Variações vinculadas aos produtos existentes.
-- Produtos antigos continuam usando o estoque geral até a conversão explícita.
alter table public.produtos
  add column controla_variacoes boolean not null default false;
create table public.produto_variacoes (
  id uuid primary key default gen_random_uuid(),
  produto_id integer not null
    references public.produtos(id) on delete restrict,

  tipo text not null,
  nome text not null,
  sku text,

  estoque integer not null default 0,
  preco numeric(10,2),
  preco_promocional numeric(10,2),

  imagem text,
  ativo boolean not null default true,

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint variacao_tipo_valido
    check (tipo in ('cor', 'tamanho', 'fragrancia', 'acabamento', 'kit', 'outro')),

  constraint variacao_nome_valido
    check (length(btrim(nome)) between 1 and 120),

  constraint variacao_estoque_valido
    check (estoque >= 0),

  constraint variacao_preco_valido
    check (preco is null or preco >= 0),

  constraint variacao_promocao_valida
  check (
    preco_promocional is null
    or (
      preco is not null
      and preco_promocional >= 0
      and preco_promocional <= preco
    )
  )
);

create index produto_variacoes_produto_id_idx
  on public.produto_variacoes(produto_id);

create unique index produto_variacoes_sku_uidx
  on public.produto_variacoes(produto_id, lower(sku))
  where sku is not null and length(btrim(sku)) > 0;

-- Preserva a identificação da variação comprada no histórico.
alter table public.itens_pedido
  add column variacao_id uuid null
    references public.produto_variacoes(id) on delete restrict,
  add column nome_variacao text null,
  add column sku_variacao text null;

create index itens_pedido_variacao_id_idx
  on public.itens_pedido(variacao_id);

-- O histórico guarda os dados da compra, mesmo que a variação mude.
comment on column public.itens_pedido.nome_variacao
  is 'Nome da variação no momento da compra.';

comment on column public.itens_pedido.sku_variacao
  is 'SKU da variação no momento da compra.';

alter table public.produto_variacoes enable row level security;

revoke all on public.produto_variacoes from anon, authenticated;
grant all on public.produto_variacoes to service_role;

-- Mantém o estoque geral igual à soma das variações.
-- Bloqueia o produto antes de qualquer alteração nas variações.
create or replace function public.bloquear_estoque_produto_variacoes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  produto_atual integer;
  produto_antigo integer;
  produto_novo integer;
begin
  if TG_OP <> 'INSERT' then
    produto_antigo := OLD.produto_id;
  end if;

  if TG_OP <> 'DELETE' then
    produto_novo := NEW.produto_id;
  end if;

  for produto_atual in
    select p.id
    from public.produtos p
    where p.id in (produto_antigo, produto_novo)
    order by p.id
    for update
  loop
    null;
  end loop;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;

  return NEW;
end;
$$;

-- Recalcula o estoque geral depois da alteração.
create or replace function public.sincronizar_estoque_produto_variacoes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  produto_antigo integer;
  produto_novo integer;
  produto_atual integer;
begin
  if TG_OP <> 'INSERT' then
    produto_antigo := OLD.produto_id;
  end if;

  if TG_OP <> 'DELETE' then
    produto_novo := NEW.produto_id;
  end if;

  for produto_atual in
    select p.id
    from public.produtos p
    where p.id in (produto_antigo, produto_novo)
      and p.controla_variacoes = true
    order by p.id
  loop
    update public.produtos p
    set estoque = (
      select coalesce(sum(v.estoque), 0)::integer
      from public.produto_variacoes v
      where v.produto_id = produto_atual
    ),
    atualizado_em = now()
    where p.id = produto_atual;
  end loop;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;

  return NEW;
end;
$$;

revoke all on function public.bloquear_estoque_produto_variacoes()
from public, anon, authenticated;

revoke all on function public.sincronizar_estoque_produto_variacoes()
from public, anon, authenticated;

create trigger bloquear_estoque_antes_alteracao_variacao
before insert or update or delete
on public.produto_variacoes
for each row
execute function public.bloquear_estoque_produto_variacoes();

create trigger sincronizar_estoque_apos_alteracao_variacao
after insert or update or delete
on public.produto_variacoes
for each row
execute function public.sincronizar_estoque_produto_variacoes();



-- Preserva a integridade das variações ligadas a pedidos e reservas.
create or replace function public.proteger_historico_variacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservado bigint := 0;
begin
  if TG_OP = 'DELETE' then
    if exists (
      select 1 from public.itens_pedido
      where variacao_id = OLD.id
    ) then
      raise exception 'Esta variação possui histórico de pedidos e não pode ser excluída.';
    end if;

    if to_regclass('public.reservas_estoque') is not null then
      execute
        'select coalesce(sum(quantidade), 0)
           from public.reservas_estoque
          where variacao_id = $1
            and status = ''reservada''
            and expira_em > now()'
        into v_reservado
        using OLD.id;

      if v_reservado > 0 then
        raise exception 'Esta variação possui reservas ativas e não pode ser excluída.';
      end if;

      if exists (
        select 1 from public.reservas_estoque
        where variacao_id = OLD.id
      ) then
        raise exception 'Esta variação possui histórico de reservas e não pode ser excluída.';
      end if;
    end if;

    if exists (
      select 1
      from public.produtos p
      where p.id = OLD.produto_id
        and p.controla_variacoes = true
        and (
          select count(*)
          from public.produto_variacoes v
          where v.produto_id = OLD.produto_id
            and v.id <> OLD.id
        ) = 0
    ) then
      raise exception 'Não é possível excluir a última variação de um produto convertido.';
    end if;

    return OLD;
  end if;

  if NEW.produto_id <> OLD.produto_id then
    raise exception 'Não é permitido transferir uma variação para outro produto.';
  end if;

  if NEW.estoque < OLD.estoque
     and to_regclass('public.reservas_estoque') is not null then
    execute
      'select coalesce(sum(quantidade), 0)
         from public.reservas_estoque
        where variacao_id = $1
          and status = ''reservada''
          and expira_em > now()'
      into v_reservado
      using OLD.id;

    if NEW.estoque < v_reservado then
      raise exception
        'O estoque não pode ficar abaixo das reservas ativas (%).',
        v_reservado;
    end if;
  end if;

  return NEW;
end;
$$;

revoke all on function public.proteger_historico_variacao() from public, anon, authenticated;
create trigger proteger_historico_variacao_antes_alteracao
before update or delete on public.produto_variacoes
for each row execute function public.proteger_historico_variacao();

-- Converte um produto para controle por variações sem alterar seu estoque total.
create or replace function public.converter_produto_para_variacoes(
  p_produto_id integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estoque_atual integer;
  v_total_variacoes bigint;
  v_quantidade_variacoes integer;
  v_controla_variacoes boolean;
begin
  select estoque, controla_variacoes
    into v_estoque_atual, v_controla_variacoes
  from public.produtos
  where id = p_produto_id
  for update;

  if not found then
    raise exception 'Produto não encontrado.';
  end if;

  if v_controla_variacoes then
    raise exception 'Este produto já utiliza controle por variações.';
  end if;

  if exists (select 1 from public.produto_variacoes where produto_id = p_produto_id and not ativo) then
    raise exception 'Ative todas as variações antes da conversão.';
  end if;
  -- Reservas e pedidos pendentes do estoque geral devem ser resolvidos primeiro.
  if exists (select 1 from public.itens_pedido i join public.pedidos p on p.id=i.pedido_id
             where i.produto_id=p_produto_id and p.status='aguardando_pagamento'
             and coalesce((to_jsonb(p)->>'pedido_teste')::boolean,false)=false) then
    raise exception 'Produto possui pedidos aguardando pagamento. Resolva-os antes da conversão.';
  end if;

  select count(*), coalesce(sum(estoque), 0)
    into v_quantidade_variacoes, v_total_variacoes
  from public.produto_variacoes
  where produto_id = p_produto_id;

  if v_quantidade_variacoes = 0 then
    raise exception 'Cadastre pelo menos uma variação antes da conversão.';
  end if;

  if v_total_variacoes <> v_estoque_atual then
    raise exception
      'A soma das variações (%) deve ser igual ao estoque atual do produto (%).',
      v_total_variacoes, v_estoque_atual;
  end if;

  update public.produtos
  set controla_variacoes = true,
      atualizado_em = now()
  where id = p_produto_id;

  return jsonb_build_object(
    'sucesso', true,
    'produto_id', p_produto_id,
    'estoque_preservado', v_estoque_atual,
    'variacoes', v_quantidade_variacoes
  );
end;
$$;

revoke all on function public.converter_produto_para_variacoes(integer)
from public, anon, authenticated;

grant execute on function public.converter_produto_para_variacoes(integer)
to service_role;

commit;
