-- SOMENTE NO PROJETO NOVO karen-beauty-homologacao.
-- Instalação atômica: não executar no banco atual da loja.
begin;
do $$ begin
  if exists(select 1 from pg_tables where schemaname='public') then
    raise exception 'Instalação cancelada: o schema public já possui tabelas. Use apenas o projeto novo vazio.';
  end if;
  if exists(select 1 from auth.users) then
    raise exception 'Instalação cancelada: já existem usuários. Confira o projeto de homologação.';
  end if;
end $$;
create sequence public.produtos_id_seq;

CREATE TABLE public.pedidos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  numero_pedido bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  nome text NOT NULL,
  whatsapp text NOT NULL,
  email text NOT NULL,
  tipo_entrega text NOT NULL,
  cep text,
  cidade text,
  estado text,
  endereco text,
  numero text,
  complemento text,
  bairro text,
  subtotal numeric NOT NULL DEFAULT 0,
  frete numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'aguardando_pagamento'::text,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  cliente_id uuid,
  mercado_pago_order_id text,
  mercado_pago_status text,
  aceita_whatsapp boolean NOT NULL DEFAULT false,
  CONSTRAINT pedidos_pkey PRIMARY KEY (id),
  CONSTRAINT pedidos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES auth.users(id)
);
CREATE TABLE public.itens_pedido (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL,
  produto_id integer NOT NULL,
  nome_produto text NOT NULL,
  quantidade integer NOT NULL CHECK (quantidade > 0),
  preco_unitario numeric NOT NULL,
  total_item numeric NOT NULL,
  CONSTRAINT itens_pedido_pkey PRIMARY KEY (id),
  CONSTRAINT itens_pedido_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id)
);
CREATE TABLE public.produtos (
  id integer NOT NULL DEFAULT nextval('produtos_id_seq'::regclass),
  nome text NOT NULL,
  categoria text NOT NULL,
  preco numeric NOT NULL DEFAULT 0 CHECK (preco >= 0::numeric),
  descricao text DEFAULT ''::text,
  emoji text DEFAULT '🛍️'::text,
  estoque integer NOT NULL DEFAULT 0 CHECK (estoque >= 0),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  atualizado_em timestamp with time zone NOT NULL DEFAULT now(),
  imagem text,
  custo_aquisicao numeric,
  custo_adicional numeric,
  taxa_mp_percentual numeric,
  taxas_adicionais_percentual numeric,
  margem_desejada_percentual numeric,
  CONSTRAINT produtos_pkey PRIMARY KEY (id)
);
CREATE TABLE public.categorias (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE CHECK (length(btrim(nome)) >= 1 AND length(btrim(nome)) <= 80),
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT categorias_pkey PRIMARY KEY (id)
);

alter sequence public.produtos_id_seq owned by public.produtos.id;

-- Migration: 202611080001_categories_and_product_photos.sql
-- Apply manually in Supabase after reviewing the target project/schema.
-- This migration does not update or replace any existing product rows.

create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  criado_em timestamptz not null default now(),
  constraint categorias_nome_nao_vazio check (length(btrim(nome)) between 1 and 80)
);
alter table public.categorias enable row level security;
revoke all on public.categorias from anon, authenticated;
grant all on public.categorias to service_role;

insert into public.categorias (nome)
select distinct btrim(categoria)
from public.produtos
where categoria is not null and length(btrim(categoria)) > 0
on conflict (nome) do nothing;

-- Add the nullable photo URL column without changing existing product rows.
alter table public.produtos add column if not exists imagem text;

create or replace function public.renomear_categoria(categoria_id uuid, novo_nome text)
returns public.categorias
language plpgsql security definer set search_path = public
as $$
declare atual public.categorias; resultado public.categorias;
begin
  if length(btrim(novo_nome)) not between 1 and 80 then raise exception 'Nome inválido'; end if;
  select * into atual from public.categorias where id = categoria_id for update;
  if not found then raise exception 'Categoria não encontrada'; end if;
  if exists (select 1 from public.categorias c where lower(c.nome) = lower(btrim(novo_nome)) and c.id <> categoria_id) then raise exception 'Categoria já existe'; end if;
  update public.produtos set categoria = btrim(novo_nome) where categoria = atual.nome;
  update public.categorias set nome = btrim(novo_nome) where id = categoria_id returning * into resultado;
  return resultado;
end;
$$;
revoke all on function public.renomear_categoria(uuid, text) from public, anon, authenticated;
grant execute on function public.renomear_categoria(uuid, text) to service_role;

create or replace function public.excluir_categoria(categoria_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare alvo public.categorias;
begin
  select * into alvo from public.categorias where id = categoria_id for update;
  if not found then return false; end if;
  if exists (select 1 from public.produtos where categoria = alvo.nome) then return false; end if;
  delete from public.categorias where id = categoria_id;
  return true;
end;
$$;
revoke all on function public.excluir_categoria(uuid) from public, anon, authenticated;
grant execute on function public.excluir_categoria(uuid) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-photos', 'product-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;


-- Migration: 202611080002_customer_accounts.sql
-- Preparar pedidos para vincular, opcionalmente, a uma conta de cliente.
-- Pedidos existentes e compras como convidado permanecem sem cliente_id.

alter table public.pedidos
  add column if not exists cliente_id uuid null
  references auth.users(id) on delete set null;

create index if not exists pedidos_cliente_id_criado_em_idx
  on public.pedidos (cliente_id, criado_em desc);


-- Migration: 202611090001_mercado_pago_checkout.sql
-- Adds payment metadata and the WhatsApp opt-in without changing existing rows.

alter table public.pedidos
  add column if not exists mercado_pago_order_id text,
  add column if not exists mercado_pago_status text,
  add column if not exists aceita_whatsapp boolean not null default false;

create unique index if not exists pedidos_mercado_pago_order_id_uidx
  on public.pedidos (mercado_pago_order_id)
  where mercado_pago_order_id is not null;


-- Migration: 202611090002_product_pricing_fields.sql
-- Adds per-product cost and pricing estimate inputs.
-- Columns are nullable and have no defaults, so existing product rows and prices remain untouched.

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


-- Migration: 202611100001_product_variations.sql

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


-- Migration: 202611100002_stock_reservations.sql

alter table public.pedidos add column if not exists pedido_teste boolean not null default false;
-- Somente pedidos criados pelo novo fluxo podem movimentar estoque automaticamente.
alter table public.pedidos add column if not exists usa_reservas_estoque boolean not null default false;
alter table public.pedidos add column if not exists pagamento_revisao boolean not null default false;

-- Reservas temporárias de estoque.
-- A tabela produto_variacoes e as colunas de itens_pedido
-- são criadas pela migração 202611100001.

create table public.reservas_estoque (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete restrict,
  item_pedido_id uuid not null references public.itens_pedido(id) on delete restrict,
  produto_id integer not null references public.produtos(id) on delete restrict,
  variacao_id uuid null references public.produto_variacoes(id) on delete restrict,
  quantidade integer not null check (quantidade > 0),
  status text not null default 'reservada'
    check (status in ('reservada', 'consumida', 'liberada', 'expirada')),
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  finalizado_em timestamptz null
);

create index reservas_estoque_pedido_idx
  on public.reservas_estoque(pedido_id);

create index reservas_estoque_expiracao_idx
  on public.reservas_estoque(expira_em)
  where status = 'reservada';

create index reservas_estoque_produto_ativa_idx
  on public.reservas_estoque(produto_id, variacao_id)
  where status = 'reservada';

create unique index reservas_estoque_item_reservado_uidx
  on public.reservas_estoque(item_pedido_id)
  where status = 'reservada';

alter table public.reservas_estoque enable row level security;

-- Clientes não podem fabricar pedidos, confirmar pagamentos ou editar estoque
-- diretamente pelo endpoint REST do Supabase. A loja usa a API do servidor.
revoke insert, update, delete, truncate on public.pedidos, public.itens_pedido, public.produtos
from public, anon, authenticated;

revoke all on public.reservas_estoque from anon, authenticated;
grant all on public.reservas_estoque to service_role;


-- Reserva atômica de estoque por 30 minutos.

create or replace function public.reservar_estoque_pedido(
  p_pedido_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido record;
  v_item record;
  v_estoque integer;
  v_produto_ativo boolean;
  v_controla_variacoes boolean;
  v_reservado bigint;
  v_disponivel bigint;
  v_expiracao timestamptz := now() + interval '30 minutes';
  v_total bigint := 0;
  v_itens integer := 0;
begin
  select id, pedido_teste, status, usa_reservas_estoque
  into v_pedido
  from public.pedidos
  where id = p_pedido_id
  for update;

  if not found then
    raise exception 'Pedido não encontrado.';
  end if;

  if v_pedido.pedido_teste then
    raise exception 'Pedido de teste não pode reservar estoque.';
  end if;

  if not v_pedido.usa_reservas_estoque then
    raise exception 'Pedido legado exige revisão manual, sem movimentação automática.';
  end if;

  if v_pedido.status <> 'aguardando_pagamento' then
    raise exception 'Pedido não está aguardando pagamento.';
  end if;

  if exists (
    select 1
    from public.reservas_estoque
    where pedido_id = p_pedido_id
      
  ) then
    raise exception 'Este pedido já possui reserva ativa ou estoque consumido.';
  end if;

  update public.reservas_estoque
  set status = 'expirada',
      finalizado_em = now()
  where pedido_id = p_pedido_id
    and status = 'reservada'
    and expira_em <= now();

  for v_item in
    select *
    from public.itens_pedido
    where pedido_id = p_pedido_id
    order by produto_id, variacao_id nulls first, id
  loop
    v_itens := v_itens + 1;

    -- Bloqueia sempre o produto principal.
    -- Isso serializa reservas de diferentes variações do mesmo produto.
    select estoque, ativo, controla_variacoes
    into v_estoque, v_produto_ativo, v_controla_variacoes
    from public.produtos
    where id = v_item.produto_id
    for update;

    if not found or not v_produto_ativo then
      raise exception 'Produto indisponível: %', v_item.nome_produto;
    end if;

    if v_controla_variacoes <> (v_item.variacao_id is not null) then
      raise exception 'Escolha de variação incompatível com o controle do produto.';
    end if;

    -- Para produtos com variação, usa o estoque da variação.
    if v_item.variacao_id is not null then
      select estoque
      into v_estoque
      from public.produto_variacoes
      where id = v_item.variacao_id
        and produto_id = v_item.produto_id
        and ativo = true
      for update;

      if not found then
        raise exception 'Variação indisponível: %', v_item.nome_produto;
      end if;
    end if;

    select coalesce(sum(quantidade), 0)
    into v_reservado
    from public.reservas_estoque
    where produto_id = v_item.produto_id
      and variacao_id is not distinct from v_item.variacao_id
      and status = 'reservada'
      and expira_em > now();

    v_disponivel := v_estoque - v_reservado;

    if v_item.quantidade < 1 or v_item.quantidade > v_disponivel then
      raise exception 'Estoque insuficiente para: %', v_item.nome_produto;
    end if;

    insert into public.reservas_estoque (
      pedido_id,
      item_pedido_id,
      produto_id,
      variacao_id,
      quantidade,
      expira_em
    )
    values (
      p_pedido_id,
      v_item.id,
      v_item.produto_id,
      v_item.variacao_id,
      v_item.quantidade,
      v_expiracao
    );

    v_total := v_total + v_item.quantidade;
  end loop;

  if v_itens = 0 then
    raise exception 'Pedido não possui itens.';
  end if;

  return jsonb_build_object(
    'pedido_id', p_pedido_id,
    'quantidade_reservada', v_total,
    'expira_em', v_expiracao
  );
end;
$$;

revoke all on function public.reservar_estoque_pedido(uuid)
from public, anon, authenticated;

grant execute on function public.reservar_estoque_pedido(uuid)
to service_role;

create or replace function public.confirmar_reserva_pedido(
  p_pedido_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido record;
  v_reserva record;
  v_itens integer;
  v_reservas integer;
  v_consumidas integer;
  v_processadas integer := 0;
  
begin
  select id, pedido_teste, status, usa_reservas_estoque
  into v_pedido
  from public.pedidos
  where id = p_pedido_id
  for update;

  if not found then
    raise exception 'Pedido não encontrado.';
  end if;

  if v_pedido.pedido_teste then
    raise exception 'Pedido de teste não pode baixar estoque.';
  end if;

  select count(*) into v_itens
  from public.itens_pedido
  where pedido_id = p_pedido_id;

  select count(*) into v_consumidas
  from public.reservas_estoque
  where pedido_id = p_pedido_id
    and status = 'consumida';

  if v_consumidas = v_itens and v_itens > 0 then
    if exists (
      select 1 from public.itens_pedido i where i.pedido_id=p_pedido_id and not exists (
        select 1 from public.reservas_estoque r where r.item_pedido_id=i.id and r.pedido_id=i.pedido_id
        and r.produto_id=i.produto_id and r.variacao_id is not distinct from i.variacao_id
        and r.quantidade=i.quantidade and r.status='consumida'
      )
    ) then raise exception 'Histórico de consumo divergente. Revisão manual necessária.'; end if;
    return jsonb_build_object(
      'sucesso', true,
      'ja_confirmado', true
    );
  end if;

  if v_consumidas > 0 then
    raise exception 'Reservas parcialmente consumidas. Revisão manual necessária.';
  end if;

  select count(*) into v_reservas
  from public.reservas_estoque
  where pedido_id = p_pedido_id
    and status = 'reservada'
    and expira_em > now();

  if v_itens = 0 or v_reservas <> v_itens
     or exists (
       select 1
       from public.itens_pedido i
       left join public.reservas_estoque r
         on r.item_pedido_id = i.id
        and r.pedido_id = i.pedido_id
        and r.produto_id = i.produto_id
        and r.variacao_id is not distinct from i.variacao_id
        and r.quantidade = i.quantidade
        and r.status = 'reservada'
        and r.expira_em > now()
       where i.pedido_id = p_pedido_id
         and r.id is null
     ) then
    raise exception 'Reserva inexistente, divergente ou expirada. Pedido precisa de revisão.';
  end if;

  if not v_pedido.usa_reservas_estoque then
    raise exception 'Pedido legado exige revisão manual, sem movimentação automática.';
  end if;

  if v_pedido.status <> 'aguardando_pagamento' then
    raise exception 'Status do pedido não permite confirmação.';
  end if;

  for v_reserva in
    select *
    from public.reservas_estoque
    where pedido_id = p_pedido_id
      and status = 'reservada'
      and expira_em > now()
    order by produto_id, variacao_id nulls first, id
    for update
  loop
    perform 1
    from public.produtos
    where id = v_reserva.produto_id
    for update;

    if exists (select 1 from public.produtos where id=v_reserva.produto_id
               and controla_variacoes <> (v_reserva.variacao_id is not null)) then
      raise exception 'Controle de estoque divergente.';
    end if;
    -- Retira esta reserva do saldo reservado ANTES da baixa. A transação reverte tudo em falhas.
    update public.reservas_estoque set status='consumida', finalizado_em=now() where id=v_reserva.id;

    if v_reserva.variacao_id is not null then

      update public.produto_variacoes
      set estoque = estoque - v_reserva.quantidade,
          atualizado_em = now()
      where id = v_reserva.variacao_id
        and produto_id = v_reserva.produto_id
        and ativo = true
        and estoque >= v_reserva.quantidade;

      if not found then
        raise exception 'Estoque insuficiente na variação do produto.';
      end if;

    else

      update public.produtos
      set estoque = estoque - v_reserva.quantidade,
          atualizado_em = now()
      where id = v_reserva.produto_id
        and estoque >= v_reserva.quantidade;

      if not found then
        raise exception 'Estoque insuficiente para o produto.';
      end if;

    end if;

    update public.reservas_estoque
    set status = 'consumida',
        finalizado_em = now()
    where id = v_reserva.id;

    v_processadas := v_processadas + 1;

  end loop;

  if v_processadas <> v_itens then
    raise exception 'Nem todos os itens tiveram o estoque confirmado.';
  end if;

  update public.pedidos
  set status = 'confirmado'
  where id = p_pedido_id;

  return jsonb_build_object(
    'sucesso', true,
    'pedido_id', p_pedido_id,
    'quantidade_itens', v_itens
  );
end;
$$;

revoke all on function public.confirmar_reserva_pedido(uuid)
from public, anon, authenticated;

grant execute on function public.confirmar_reserva_pedido(uuid)
to service_role;


-- Libera reservas quando o pagamento é recusado ou cancelado.
create or replace function public.liberar_reserva_estoque_pedido(
  p_pedido_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido record;
  v_liberadas integer := 0;
begin
  select id, pedido_teste
  into v_pedido
  from public.pedidos
  where id = p_pedido_id
  for update;

  if not found then
    raise exception 'Pedido não encontrado';
  end if;

  if v_pedido.pedido_teste then
    raise exception 'Pedidos de teste não podem liberar estoque';
  end if;

  update public.reservas_estoque
  set status = 'liberada',
      finalizado_em = now()
  where pedido_id = p_pedido_id
    and status = 'reservada';

  get diagnostics v_liberadas = row_count;

  return jsonb_build_object(
    'sucesso', true,
    'pedido_id', p_pedido_id,
    'reservas_liberadas', v_liberadas
  );
end;
$$;

revoke all on function public.liberar_reserva_estoque_pedido(uuid)
from public, anon, authenticated;

grant execute on function public.liberar_reserva_estoque_pedido(uuid)
to service_role;



-- Impede alterações do estoque geral que ignorem reservas ou variações.
create or replace function public.proteger_estoque_produto()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_reservado bigint; v_total bigint;
begin
  if OLD.controla_variacoes and not NEW.controla_variacoes then
    raise exception 'A conversão para variações não pode ser desfeita.';
  end if;
  if NEW.controla_variacoes then
    select coalesce(sum(estoque),0) into v_total from public.produto_variacoes where produto_id=OLD.id;
    if NEW.estoque <> v_total then raise exception 'Edite o estoque nas variações.'; end if;
  else
    select coalesce(sum(quantidade),0) into v_reservado from public.reservas_estoque
      where produto_id=OLD.id and status='reservada' and expira_em>now();
    if NEW.estoque < v_reservado then raise exception 'Estoque inferior às reservas ativas.'; end if;
  end if;
  return NEW;
end $$;
revoke all on function public.proteger_estoque_produto() from public, anon, authenticated;
create trigger proteger_estoque_produto before update on public.produtos
for each row execute function public.proteger_estoque_produto();

-- Cria o pedido, os snapshots de itens e as reservas em uma única transação.
create or replace function public.criar_pedido_reservado(p_dados jsonb, p_itens jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.pedidos; v public.produto_variacoes; prod public.produtos;
  item jsonb; qtd integer; valor numeric; soma numeric:=0; reserva jsonb;
begin
  if jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens) not between 1 and 50 then
    raise exception 'Itens inválidos.';
  end if;
  insert into public.pedidos(nome,whatsapp,email,tipo_entrega,cep,cidade,estado,endereco,numero,complemento,bairro,
    cliente_id,aceita_whatsapp,subtotal,frete,total,status,pedido_teste,usa_reservas_estoque)
  values(p_dados->>'nome',p_dados->>'whatsapp',p_dados->>'email',p_dados->>'tipo_entrega',
    p_dados->>'cep',p_dados->>'cidade',p_dados->>'estado',p_dados->>'endereco',p_dados->>'numero',
    p_dados->>'complemento',p_dados->>'bairro',nullif(p_dados->>'cliente_id','')::uuid,
    coalesce((p_dados->>'aceita_whatsapp')::boolean,false),0,0,0,'aguardando_pagamento',false,true) returning * into p;
  -- Todas as rotas que movimentam estoque usam a mesma ordem de bloqueio.
  perform 1 from public.produtos where id in
    (select (value->>'produto_id')::integer from jsonb_array_elements(p_itens)) order by id for update;
  for item in select value from jsonb_array_elements(p_itens) loop
    qtd := (item->>'quantidade')::integer;
    if qtd is null or qtd not between 1 and 10000 then raise exception 'Quantidade inválida.'; end if;
    select * into prod from public.produtos where id=(item->>'produto_id')::integer and ativo;
    if not found then raise exception 'Produto indisponível.'; end if;
    v := null;
    valor := prod.preco;
    if prod.controla_variacoes then
      select * into v from public.produto_variacoes where id=(item->>'variacao_id')::uuid and produto_id=prod.id and ativo for update;
      if not found then raise exception 'Selecione uma variação válida.'; end if;
      valor := coalesce(v.preco_promocional,v.preco,prod.preco);
    elsif nullif(item->>'variacao_id','') is not null then
      raise exception 'Produto ainda não convertido para variações.';
    end if;
    valor := round(valor,2);
    if valor<=0 then raise exception 'Produto sem preço válido para pagamento.'; end if;
    insert into public.itens_pedido(pedido_id,produto_id,nome_produto,quantidade,preco_unitario,total_item,variacao_id,nome_variacao,sku_variacao)
    values(p.id,prod.id,prod.nome,qtd,valor,valor*qtd,v.id,v.nome,v.sku);
    soma := soma+valor*qtd;
  end loop;
  update public.pedidos set subtotal=soma,total=soma where id=p.id;
  reserva := public.reservar_estoque_pedido(p.id);
  return jsonb_build_object('id',p.id,'numero_pedido',p.numero_pedido,'total',soma,'expira_em',reserva->>'expira_em',
    'itens',(select jsonb_agg(to_jsonb(i)) from public.itens_pedido i where pedido_id=p.id));
end $$;
revoke all on function public.criar_pedido_reservado(jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.criar_pedido_reservado(jsonb,jsonb) to service_role;

-- Confirmação e liberação serializadas pelo mesmo bloqueio do pedido.
-- Não cria reservas retroativas para pedidos legados e não toca pedidos de teste.
create or replace function public.processar_pagamento_reservado(p_pedido_id uuid,p_order_id text,p_status text,p_total numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.pedidos; resultado jsonb; novo text;
begin
  select * into p from public.pedidos where id=p_pedido_id for update;
  if not found or p.mercado_pago_order_id is distinct from p_order_id or p.total<>p_total then
    raise exception 'Referência ou total divergente.';
  end if;
  if p.pedido_teste then return jsonb_build_object('ignorado',true); end if;
  if p_status not in ('processed','failed','canceled','expired','refunded','charged_back') then
    return jsonb_build_object('ignorado',true);
  end if;
  if not p.usa_reservas_estoque then
    update public.pedidos set mercado_pago_status=p_status,
      pagamento_revisao=pagamento_revisao or (p_status='processed' and status not in ('confirmado','preparando','enviado','concluido')) where id=p.id;
    return jsonb_build_object('legado',true);
  end if;
  if p_status='processed' then
    if p.status in ('confirmado','preparando','enviado','concluido','reembolsado','chargeback') then
      return jsonb_build_object('ja_confirmado',true);
    end if;
    begin
      resultado := public.confirmar_reserva_pedido(p.id);
    exception when others then
      update public.pedidos set pagamento_revisao=true,mercado_pago_status=p_status where id=p.id;
      return jsonb_build_object('revisao',true);
    end;
    update public.pedidos set mercado_pago_status=p_status,pagamento_revisao=false where id=p.id;
    return jsonb_build_object('confirmado_agora',not coalesce((resultado->>'ja_confirmado')::boolean,false));
  end if;
  if p_status in ('refunded','charged_back') then
    novo := case when p_status='refunded' then 'reembolsado' else 'chargeback' end;
    perform public.liberar_reserva_estoque_pedido(p.id);
    -- Estorno não repõe automaticamente mercadoria já vendida.
    update public.pedidos set status=novo,mercado_pago_status=p_status,pagamento_revisao=true where id=p.id;
  elsif p.status='aguardando_pagamento' then
    perform public.liberar_reserva_estoque_pedido(p.id);
    novo := case p_status when 'failed' then 'pagamento_recusado' when 'expired' then 'reserva_expirada' else 'cancelado' end;
    update public.pedidos set status=novo,mercado_pago_status=p_status where id=p.id;
  end if;
  return jsonb_build_object('confirmado_agora',false);
end $$;
revoke all on function public.processar_pagamento_reservado(uuid,text,text,numeric) from public, anon, authenticated;
grant execute on function public.processar_pagamento_reservado(uuid,text,text,numeric) to service_role;

-- Alteração administrativa restrita a etapas operacionais; não confirma pagamento.
create or replace function public.alterar_etapa_pedido(p_pedido_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.pedidos;
begin
  select * into p from public.pedidos where id=p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if p.pedido_teste then raise exception 'Pedido de teste preservado; alteração bloqueada.'; end if;
  if not ((p.status='confirmado' and p_status='preparando') or
          (p.status='preparando' and p_status='enviado') or
          (p.status in ('preparando','enviado') and p_status='concluido')) then
    raise exception 'Transição inválida. Pagamentos e cancelamentos devem ser tratados no Mercado Pago.';
  end if;
  update public.pedidos set status=p_status where id=p.id;
  return jsonb_build_object('id',p.id,'numero_pedido',p.numero_pedido,'status',p_status);
end $$;
revoke all on function public.alterar_etapa_pedido(uuid,text) from public, anon, authenticated;
grant execute on function public.alterar_etapa_pedido(uuid,text) to service_role;

-- Edição de variações bloqueia primeiro o produto, como as reservas.
create or replace function public.salvar_variacao(p_produto_id integer,p_id uuid,p_dados jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.produto_variacoes;
begin
  perform 1 from public.produtos where id=p_produto_id for update;
  if not found then raise exception 'Produto não encontrado.'; end if;
  if p_id is null then
    insert into public.produto_variacoes(produto_id,tipo,nome,sku,estoque,preco,preco_promocional,imagem,ativo)
    values(p_produto_id,p_dados->>'tipo',btrim(p_dados->>'nome'),nullif(btrim(p_dados->>'sku'),''),
      (p_dados->>'estoque')::integer,(p_dados->>'preco')::numeric,(p_dados->>'preco_promocional')::numeric,
      p_dados->>'imagem',(p_dados->>'ativo')::boolean) returning * into v;
  else
    update public.produto_variacoes set tipo=p_dados->>'tipo',nome=btrim(p_dados->>'nome'),sku=nullif(btrim(p_dados->>'sku'),''),
      estoque=(p_dados->>'estoque')::integer,preco=(p_dados->>'preco')::numeric,preco_promocional=(p_dados->>'preco_promocional')::numeric,
      imagem=p_dados->>'imagem',ativo=(p_dados->>'ativo')::boolean,atualizado_em=now()
      where id=p_id and produto_id=p_produto_id returning * into v;
    if not found then raise exception 'Variação não encontrada.'; end if;
  end if;
  return to_jsonb(v);
end $$;
revoke all on function public.salvar_variacao(integer,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.salvar_variacao(integer,uuid,jsonb) to service_role;

-- Snapshot de disponibilidade, sem expor custos nem dados de compradores.
create or replace function public.catalogo_disponivel()
returns jsonb language sql security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'name',p.nome,'category',p.categoria,'price',p.preco,'description',p.descricao,'emoji',p.emoji,'imagem',p.imagem,
    'controla_variacoes',p.controla_variacoes,
    'stock',case when p.controla_variacoes then
      (select coalesce(sum(greatest(v.estoque-coalesce((select sum(r.quantidade) from public.reservas_estoque r
        where r.variacao_id=v.id and r.status='reservada' and r.expira_em>now()),0),0)),0)
       from public.produto_variacoes v where v.produto_id=p.id and v.ativo)
      else greatest(p.estoque-coalesce((select sum(r.quantidade) from public.reservas_estoque r
        where r.produto_id=p.id and r.variacao_id is null and r.status='reservada' and r.expira_em>now()),0),0) end,
    'variacoes',case when p.controla_variacoes then
      (select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'tipo',v.tipo,'nome',v.nome,'sku',v.sku,'imagem',v.imagem,
        'price',coalesce(v.preco_promocional,v.preco,p.preco),'stock',greatest(v.estoque-coalesce((select sum(r.quantidade)
          from public.reservas_estoque r where r.variacao_id=v.id and r.status='reservada' and r.expira_em>now()),0),0)) order by v.nome),'[]'::jsonb)
       from public.produto_variacoes v where v.produto_id=p.id and v.ativo)
      else '[]'::jsonb end) order by p.id),'[]'::jsonb) from public.produtos p where p.ativo;
$$;
revoke all on function public.catalogo_disponivel() from public, anon, authenticated;
grant execute on function public.catalogo_disponivel() to service_role;


-- Migration: 202611110001_safe_variation_edit.sql
-- Aplicar somente após revisão e autorização. Não modifica dados existentes.
create or replace function public.salvar_variacao(p_produto_id integer,p_id uuid,p_dados jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.produto_variacoes;
begin
  perform 1 from public.produtos where id=p_produto_id for update;
  if not found then raise exception 'Produto não encontrado.'; end if;
  if p_id is null then
    insert into public.produto_variacoes(produto_id,tipo,nome,sku,estoque,preco,preco_promocional,imagem,ativo)
    values(p_produto_id,p_dados->>'tipo',btrim(p_dados->>'nome'),nullif(btrim(p_dados->>'sku'),''),
      (p_dados->>'estoque')::integer,(p_dados->>'preco')::numeric,(p_dados->>'preco_promocional')::numeric,
      p_dados->>'imagem',(p_dados->>'ativo')::boolean) returning * into v;
  else
    select * into v from public.produto_variacoes where id=p_id and produto_id=p_produto_id for update;
    if not found then raise exception 'Variação não encontrada.'; end if;
    if p_dados->>'atualizado_em_original' is null or (p_dados->>'atualizado_em_original')::timestamptz is distinct from v.atualizado_em then
      raise exception 'A variação mudou durante a edição. Recarregue antes de salvar.';
    end if;
    update public.produto_variacoes set tipo=p_dados->>'tipo',nome=btrim(p_dados->>'nome'),sku=nullif(btrim(p_dados->>'sku'),''),
      estoque=case when p_dados ? 'estoque' then (p_dados->>'estoque')::integer else estoque end,preco=(p_dados->>'preco')::numeric,preco_promocional=(p_dados->>'preco_promocional')::numeric,
      imagem=p_dados->>'imagem',ativo=(p_dados->>'ativo')::boolean,atualizado_em=now()
      where id=p_id and produto_id=p_produto_id returning * into v;
    if not found then raise exception 'Variação não encontrada.'; end if;
  end if;
  return to_jsonb(v);
end $$;
revoke all on function public.salvar_variacao(integer,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.salvar_variacao(integer,uuid,jsonb) to service_role;

-- Migration: 202611110002_delete_variation_safely.sql
-- Exclusão explícita, preservando inventário e histórico. Não aplicar remotamente sem autorização.

create or replace function public.excluir_variacao_segura(
  p_produto_id integer,
  p_id uuid,
  p_atualizado_em_original timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.produto_variacoes;
  controla boolean;
begin
  select controla_variacoes into controla
  from public.produtos where id = p_produto_id for update;
  if not found then raise exception 'Produto não encontrado.'; end if;

  select * into v from public.produto_variacoes
  where id = p_id and produto_id = p_produto_id for update;
  if not found then raise exception 'Variação não encontrada.'; end if;
  if p_atualizado_em_original is null
     or p_atualizado_em_original is distinct from v.atualizado_em then
    raise exception 'A variação mudou durante a edição. Atualize a lista antes de excluir.';
  end if;
  if controla and v.estoque <> 0 then
    raise exception 'Esta variação possui estoque. Desative-a para preservar as quantidades. Exclusão disponível somente com estoque zero.';
  end if;
  -- Gatilhos existentes bloqueiam exclusão com histórico, reservas ou da última opção convertida.
  delete from public.produto_variacoes where id = p_id and produto_id = p_produto_id;
  return jsonb_build_object('sucesso', true, 'id', p_id);
end;
$$;

revoke all on function public.excluir_variacao_segura(integer, uuid, timestamptz)
from public, anon, authenticated;
grant execute on function public.excluir_variacao_segura(integer, uuid, timestamptz)
to service_role;


-- Migration: 202611110003_primary_variation.sql
-- Define uma variação real como principal. Não cria opções nem altera estoques existentes.
alter table public.produtos add column if not exists variacao_principal_id uuid;
create unique index if not exists produto_variacoes_id_produto_principal_idx
  on public.produto_variacoes(id, produto_id);
do $$
begin
  if not exists (select 1 from pg_constraint where conname='produtos_variacao_principal_mesmo_produto_fk' and conrelid='public.produtos'::regclass) then
    alter table public.produtos add constraint produtos_variacao_principal_mesmo_produto_fk
      foreign key (variacao_principal_id, id) references public.produto_variacoes(id, produto_id);
  end if;
end;
$$;

create or replace function public.proteger_opcao_principal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'DELETE' or (TG_OP = 'UPDATE' and NEW.ativo = false) then
    if exists (select 1 from public.produtos where variacao_principal_id=OLD.id) then
      raise exception 'Defina outra opção principal na aba Geral antes de desativar ou excluir esta opção.';
    end if;
  end if;
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;
revoke all on function public.proteger_opcao_principal() from public,anon,authenticated;
drop trigger if exists proteger_opcao_principal on public.produto_variacoes;
create trigger proteger_opcao_principal before update or delete on public.produto_variacoes
for each row execute function public.proteger_opcao_principal();

create or replace function public.salvar_variacao_principal(
  p_produto_id integer,
  p_variacao_id uuid,
  p_dados jsonb,
  p_atualizado_em_original timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.produtos;
  v public.produto_variacoes;
  criada jsonb;
begin
  select * into p from public.produtos where id=p_produto_id for update;
  if not found then raise exception 'Produto não encontrado.'; end if;
  if p_atualizado_em_original is null or p.atualizado_em is distinct from p_atualizado_em_original then
    raise exception 'O produto mudou. Atualize os dados antes de definir a opção principal.';
  end if;
  if p_variacao_id is null then
    if p_dados is null or coalesce((p_dados->>'ativo')::boolean,false) = false then
      raise exception 'Cadastre uma opção principal ativa.';
    end if;
    criada := public.salvar_variacao(p_produto_id,null,p_dados);
    p_variacao_id := (criada->>'id')::uuid;
  end if;
  select * into v from public.produto_variacoes
    where id=p_variacao_id and produto_id=p_produto_id for update;
  if not found then raise exception 'A opção principal deve pertencer a este produto.'; end if;
  if not v.ativo then raise exception 'Ative a opção antes de defini-la como principal.'; end if;
  update public.produtos set variacao_principal_id=v.id, atualizado_em=now() where id=p_produto_id;
  return jsonb_build_object('sucesso',true,'variacao_principal_id',v.id,'variacao',to_jsonb(v));
end;
$$;
revoke all on function public.salvar_variacao_principal(integer,uuid,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.salvar_variacao_principal(integer,uuid,jsonb,timestamptz) to service_role;

create or replace function public.catalogo_disponivel()
returns jsonb language sql security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'name',p.nome,'category',p.categoria,'price',coalesce((select coalesce(v.preco_promocional,v.preco) from public.produto_variacoes v where v.id=p.variacao_principal_id and v.produto_id=p.id and v.ativo and p.controla_variacoes),p.preco),'description',p.descricao,'emoji',p.emoji,'imagem',coalesce((select v.imagem from public.produto_variacoes v where v.id=p.variacao_principal_id and v.produto_id=p.id and v.ativo and p.controla_variacoes),p.imagem),
    'controla_variacoes',p.controla_variacoes,
    'variacao_principal_id',case when p.controla_variacoes and exists(select 1 from public.produto_variacoes v where v.id=p.variacao_principal_id and v.produto_id=p.id and v.ativo) then p.variacao_principal_id else null end,
    'stock',case when p.controla_variacoes then
      (select coalesce(sum(greatest(v.estoque-coalesce((select sum(r.quantidade) from public.reservas_estoque r
        where r.variacao_id=v.id and r.status='reservada' and r.expira_em>now()),0),0)),0)
       from public.produto_variacoes v where v.produto_id=p.id and v.ativo)
      else greatest(p.estoque-coalesce((select sum(r.quantidade) from public.reservas_estoque r
        where r.produto_id=p.id and r.variacao_id is null and r.status='reservada' and r.expira_em>now()),0),0) end,
    'variacoes',case when p.controla_variacoes then
      (select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'tipo',v.tipo,'nome',v.nome,'sku',v.sku,'imagem',v.imagem,
        'price',coalesce(v.preco_promocional,v.preco,p.preco),'stock',greatest(v.estoque-coalesce((select sum(r.quantidade)
          from public.reservas_estoque r where r.variacao_id=v.id and r.status='reservada' and r.expira_em>now()),0),0)) order by (v.id=p.variacao_principal_id) desc nulls last,v.nome),'[]'::jsonb)
       from public.produto_variacoes v where v.produto_id=p.id and v.ativo)
      else '[]'::jsonb end) order by p.id),'[]'::jsonb) from public.produtos p where p.ativo;
$$;
revoke all on function public.catalogo_disponivel() from public, anon, authenticated;
grant execute on function public.catalogo_disponivel() to service_role;

-- Migration: 202611110004_unified_variation_editor.sql
-- Estrutura de salvamento único. Nenhum produto ou estoque é convertido durante a migration.
create or replace function public.excluir_variacao_segura(
  p_produto_id integer,
  p_id uuid,
  p_atualizado_em_original timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.produto_variacoes;
  controla boolean;
begin
  select controla_variacoes into controla
  from public.produtos where id = p_produto_id for update;
  if not found then raise exception 'Produto não encontrado.'; end if;

  select * into v from public.produto_variacoes
  where id = p_id and produto_id = p_produto_id for update;
  if not found then raise exception 'Variação não encontrada.'; end if;
  if p_atualizado_em_original is null
     or p_atualizado_em_original is distinct from v.atualizado_em then
    raise exception 'A variação mudou durante a edição. Atualize a lista antes de excluir.';
  end if;
  if controla and v.estoque <> 0 then
    raise exception 'Esta variação possui estoque. Desative-a para preservar as quantidades. Exclusão disponível somente com estoque zero.';
  end if;
  -- Gatilhos existentes bloqueiam exclusão com histórico, reservas ou da última opção convertida.
  delete from public.produto_variacoes where id = p_id and produto_id = p_produto_id;
  return jsonb_build_object('sucesso', true, 'id', p_id);
end;
$$;

revoke all on function public.excluir_variacao_segura(integer, uuid, timestamptz)
from public, anon, authenticated;
grant execute on function public.excluir_variacao_segura(integer, uuid, timestamptz)
to service_role;


create or replace function public.salvar_grupo_variacoes(
  p_produto_id integer,
  p_dados jsonb,
  p_variacoes jsonb,
  p_excluir jsonb,
  p_ajustar_estoque boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  grupo public.produtos;
  atual public.produto_variacoes;
  entrada jsonb;
  excluida jsonb;
  registro jsonb;
  identificador uuid;
  total bigint;
  quantidade integer;
  novo boolean := p_produto_id is null;
  ativa boolean;
  sequencia text;
  novo_id bigint;
begin
  if jsonb_typeof(p_variacoes) is distinct from 'array'
     or jsonb_array_length(p_variacoes) not between 1 and 50
     or jsonb_typeof(p_excluir) is distinct from 'array'
     or coalesce(length(btrim(p_dados->>'nome')),0) not between 1 and 160
     or coalesce(length(btrim(p_dados->>'categoria')),0) not between 1 and 80
     or coalesce(length(p_dados->>'descricao'),0) > 10000 then
    raise exception 'Confira os dados do produto e suas variações.';
  end if;
  if not exists (select 1 from public.categorias where nome=btrim(p_dados->>'categoria')) then
    raise exception 'Selecione uma categoria cadastrada.';
  end if;
  select count(*), coalesce(sum((v->>'estoque')::bigint),0), bool_or((v->>'ativo')::boolean)
  into quantidade, total, ativa from jsonb_array_elements(p_variacoes) v;
  if total < 0 or total > 2147483647 or ativa is null then
    raise exception 'Confira os estoques e a situação das variações.';
  end if;
  if exists (
    select 1 from (
      select v->>'id' as id from jsonb_array_elements(p_variacoes) v where v->>'id' is not null
      union all
      select v->>'id' from jsonb_array_elements(p_excluir) v
    ) ids group by id having count(*) > 1 or id is null
  ) then raise exception 'Variações repetidas ou inválidas na edição.'; end if;

  if novo then
    if jsonb_array_length(p_excluir) <> 0 or exists (select 1 from jsonb_array_elements(p_variacoes) v where v->>'id' is not null) then
      raise exception 'Um produto novo deve conter somente opções novas.';
    end if;
    -- Sequências antigas podem estar atrás dos IDs importados. Nunca reutiliza nem sobrescreve um cadastro.
    sequencia := coalesce(pg_get_serial_sequence('public.produtos','id'), to_regclass('public.produtos_id_seq')::text);
    if sequencia is null then raise exception 'A sequência de produtos precisa ser configurada.'; end if;
    loop
      novo_id := nextval(sequencia::regclass);
      if novo_id > 2147483647 then raise exception 'Limite de identificadores de produto atingido.'; end if;
      exit when not exists (select 1 from public.produtos where id=novo_id);
    end loop;
    insert into public.produtos(id,nome,categoria,descricao,preco,estoque,ativo,emoji,imagem)
    values(novo_id::integer,btrim(p_dados->>'nome'),btrim(p_dados->>'categoria'),coalesce(p_dados->>'descricao',''),
      (p_variacoes->0->>'preco')::numeric,total::integer,ativa,'🛍️',null)
    returning * into grupo;
    p_produto_id := grupo.id;
  else
    select * into grupo from public.produtos where id=p_produto_id for update;
    if not found then raise exception 'Produto não encontrado.'; end if;
    if p_dados->>'atualizado_em' is null
       or grupo.atualizado_em is distinct from (p_dados->>'atualizado_em')::timestamptz
       or grupo.estoque is distinct from (p_dados->>'estoque_original')::integer then
      raise exception 'O produto ou o estoque mudou durante a edição. Reabra o cadastro antes de salvar.';
    end if;
  end if;

  -- Confere todo o conjunto, inclusive exclusões, antes de qualquer alteração de opções.
  for atual in select * from public.produto_variacoes where produto_id=p_produto_id order by id for update loop
    select v into entrada from jsonb_array_elements(p_variacoes) v where v->>'id'=atual.id::text;
    select v into excluida from jsonb_array_elements(p_excluir) v where v->>'id'=atual.id::text;
    if entrada is null and excluida is null then
      raise exception 'A lista de variações mudou. Reabra o cadastro antes de salvar.';
    end if;
    registro := coalesce(entrada,excluida);
    if registro->>'atualizado_em' is null
       or atual.atualizado_em is distinct from (registro->>'atualizado_em')::timestamptz then
      raise exception 'Uma variação mudou durante a edição. Reabra o cadastro antes de salvar.';
    end if;
  end loop;
  if exists (
    select 1 from (
      select v from jsonb_array_elements(p_variacoes) v where v->>'id' is not null
      union all select v from jsonb_array_elements(p_excluir) v
    ) escolhidas
    where not exists (select 1 from public.produto_variacoes where id=(v->>'id')::uuid and produto_id=p_produto_id)
  ) then raise exception 'Uma opção não pertence a este produto.'; end if;

  if not grupo.controla_variacoes then
    if exists (
      select 1 from public.itens_pedido i join public.pedidos p on p.id=i.pedido_id
      where i.produto_id=p_produto_id and p.status='aguardando_pagamento' and not p.pedido_teste
    ) or exists (
      select 1 from public.reservas_estoque where produto_id=p_produto_id
      and variacao_id is null and status='reservada' and expira_em>now()
    ) then raise exception 'Produto possui pedidos ou reservas pendentes. Resolva-os antes de converter.'; end if;
    if total <> grupo.estoque and not coalesce(p_ajustar_estoque,false) then
      raise exception 'A soma das opções difere do estoque original. Confira e confirme o ajuste físico antes de salvar.';
    end if;
  end if;

  -- O agrupamento deixa de escolher uma opção principal. Todas passam a ter a mesma função.
  update public.produtos set variacao_principal_id=null where id=p_produto_id;
  for entrada in select value from jsonb_array_elements(p_variacoes) loop
    identificador := (entrada->>'id')::uuid;
    registro := public.salvar_variacao(p_produto_id,identificador,
      entrada || jsonb_build_object('atualizado_em_original',entrada->>'atualizado_em'));
  end loop;
  for excluida in select value from jsonb_array_elements(p_excluir) loop
    -- As proteções existentes impedem apagar estoque convertido ou histórico.
    perform public.excluir_variacao_segura(p_produto_id,(excluida->>'id')::uuid,(excluida->>'atualizado_em')::timestamptz);
  end loop;
  select count(*), coalesce(sum(estoque),0) into quantidade,total
  from public.produto_variacoes where produto_id=p_produto_id;
  if quantidade < 1 then raise exception 'Mantenha pelo menos uma opção no cadastro.'; end if;
  if not grupo.controla_variacoes then
    -- A soma é conferida nesta transação, inclusive opções inativas.
    update public.produtos set estoque=total::integer where id=p_produto_id;
  end if;
  update public.produtos set
    nome=btrim(p_dados->>'nome'), categoria=btrim(p_dados->>'categoria'),
    descricao=coalesce(p_dados->>'descricao',''), imagem=null,
    controla_variacoes=true, ativo=ativa, atualizado_em=now()
  where id=p_produto_id;

  return jsonb_build_object('id',p_produto_id,'variacoes',quantidade,'estoque',total,'sucesso',true);
end;
$$;
revoke all on function public.salvar_grupo_variacoes(integer,jsonb,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.salvar_grupo_variacoes(integer,jsonb,jsonb,jsonb,boolean) to service_role;

-- Migration: 202611110005_pricing_for_unified_editor.sql
-- Estrutura de salvamento único. Nenhum produto ou estoque é convertido durante a migration.
create or replace function public.excluir_variacao_segura(
  p_produto_id integer,
  p_id uuid,
  p_atualizado_em_original timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.produto_variacoes;
  controla boolean;
begin
  select controla_variacoes into controla
  from public.produtos where id = p_produto_id for update;
  if not found then raise exception 'Produto não encontrado.'; end if;

  select * into v from public.produto_variacoes
  where id = p_id and produto_id = p_produto_id for update;
  if not found then raise exception 'Variação não encontrada.'; end if;
  if p_atualizado_em_original is null
     or p_atualizado_em_original is distinct from v.atualizado_em then
    raise exception 'A variação mudou durante a edição. Atualize a lista antes de excluir.';
  end if;
  if controla and v.estoque <> 0 then
    raise exception 'Esta variação possui estoque. Desative-a para preservar as quantidades. Exclusão disponível somente com estoque zero.';
  end if;
  -- Gatilhos existentes bloqueiam exclusão com histórico, reservas ou da última opção convertida.
  delete from public.produto_variacoes where id = p_id and produto_id = p_produto_id;
  return jsonb_build_object('sucesso', true, 'id', p_id);
end;
$$;

revoke all on function public.excluir_variacao_segura(integer, uuid, timestamptz)
from public, anon, authenticated;
grant execute on function public.excluir_variacao_segura(integer, uuid, timestamptz)
to service_role;


create or replace function public.salvar_grupo_variacoes(
  p_produto_id integer,
  p_dados jsonb,
  p_variacoes jsonb,
  p_excluir jsonb,
  p_ajustar_estoque boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  grupo public.produtos;
  atual public.produto_variacoes;
  entrada jsonb;
  excluida jsonb;
  registro jsonb;
  identificador uuid;
  total bigint;
  quantidade integer;
  novo boolean := p_produto_id is null;
  ativa boolean;
  sequencia text;
  novo_id bigint;
  custo_aq numeric;
  custo_add numeric;
  taxa_mp numeric;
  taxas_extra numeric;
  margem numeric;
begin
  if jsonb_typeof(p_variacoes) is distinct from 'array'
     or jsonb_array_length(p_variacoes) not between 1 and 50
     or jsonb_typeof(p_excluir) is distinct from 'array'
     or coalesce(length(btrim(p_dados->>'nome')),0) not between 1 and 160
     or coalesce(length(btrim(p_dados->>'categoria')),0) not between 1 and 80
     or coalesce(length(p_dados->>'descricao'),0) > 10000 then
    raise exception 'Confira os dados do produto e suas variações.';
  end if;
  if not exists (select 1 from public.categorias where nome=btrim(p_dados->>'categoria')) then
    raise exception 'Selecione uma categoria cadastrada.';
  end if;
  select count(*), coalesce(sum((v->>'estoque')::bigint),0), bool_or((v->>'ativo')::boolean)
  into quantidade, total, ativa from jsonb_array_elements(p_variacoes) v;
  if total < 0 or total > 2147483647 or ativa is null then
    raise exception 'Confira os estoques e a situação das variações.';
  end if;
  if exists (
    select 1 from (
      select v->>'id' as id from jsonb_array_elements(p_variacoes) v where v->>'id' is not null
      union all
      select v->>'id' from jsonb_array_elements(p_excluir) v
    ) ids group by id having count(*) > 1 or id is null
  ) then raise exception 'Variações repetidas ou inválidas na edição.'; end if;

  if novo then
    if jsonb_array_length(p_excluir) <> 0 or exists (select 1 from jsonb_array_elements(p_variacoes) v where v->>'id' is not null) then
      raise exception 'Um produto novo deve conter somente opções novas.';
    end if;
    -- Sequências antigas podem estar atrás dos IDs importados. Nunca reutiliza nem sobrescreve um cadastro.
    sequencia := coalesce(pg_get_serial_sequence('public.produtos','id'), to_regclass('public.produtos_id_seq')::text);
    if sequencia is null then raise exception 'A sequência de produtos precisa ser configurada.'; end if;
    loop
      novo_id := nextval(sequencia::regclass);
      if novo_id > 2147483647 then raise exception 'Limite de identificadores de produto atingido.'; end if;
      exit when not exists (select 1 from public.produtos where id=novo_id);
    end loop;
    insert into public.produtos(id,nome,categoria,descricao,preco,estoque,ativo,emoji,imagem)
    values(novo_id::integer,btrim(p_dados->>'nome'),btrim(p_dados->>'categoria'),coalesce(p_dados->>'descricao',''),
      (p_variacoes->0->>'preco')::numeric,total::integer,ativa,'🛍️',null)
    returning * into grupo;
    p_produto_id := grupo.id;
  else
    select * into grupo from public.produtos where id=p_produto_id for update;
    if not found then raise exception 'Produto não encontrado.'; end if;
    if p_dados->>'atualizado_em' is null
       or grupo.atualizado_em is distinct from (p_dados->>'atualizado_em')::timestamptz
       or grupo.estoque is distinct from (p_dados->>'estoque_original')::integer then
      raise exception 'O produto ou o estoque mudou durante a edição. Reabra o cadastro antes de salvar.';
    end if;
  end if;

  -- Confere todo o conjunto, inclusive exclusões, antes de qualquer alteração de opções.
  for atual in select * from public.produto_variacoes where produto_id=p_produto_id order by id for update loop
    select v into entrada from jsonb_array_elements(p_variacoes) v where v->>'id'=atual.id::text;
    select v into excluida from jsonb_array_elements(p_excluir) v where v->>'id'=atual.id::text;
    if entrada is null and excluida is null then
      raise exception 'A lista de variações mudou. Reabra o cadastro antes de salvar.';
    end if;
    registro := coalesce(entrada,excluida);
    if registro->>'atualizado_em' is null
       or atual.atualizado_em is distinct from (registro->>'atualizado_em')::timestamptz then
      raise exception 'Uma variação mudou durante a edição. Reabra o cadastro antes de salvar.';
    end if;
  end loop;
  if exists (
    select 1 from (
      select v from jsonb_array_elements(p_variacoes) v where v->>'id' is not null
      union all select v from jsonb_array_elements(p_excluir) v
    ) escolhidas
    where not exists (select 1 from public.produto_variacoes where id=(v->>'id')::uuid and produto_id=p_produto_id)
  ) then raise exception 'Uma opção não pertence a este produto.'; end if;

  if not grupo.controla_variacoes then
    if exists (
      select 1 from public.itens_pedido i join public.pedidos p on p.id=i.pedido_id
      where i.produto_id=p_produto_id and p.status='aguardando_pagamento' and not p.pedido_teste
    ) or exists (
      select 1 from public.reservas_estoque where produto_id=p_produto_id
      and variacao_id is null and status='reservada' and expira_em>now()
    ) then raise exception 'Produto possui pedidos ou reservas pendentes. Resolva-os antes de converter.'; end if;
    if total <> grupo.estoque and not coalesce(p_ajustar_estoque,false) then
      raise exception 'A soma das opções difere do estoque original. Confira e confirme o ajuste físico antes de salvar.';
    end if;
  end if;

  -- Os custos são compartilhados pelo produto e usados para sugerir o preço de cada opção.
  custo_aq := coalesce((p_dados->>'custo_aquisicao')::numeric, grupo.custo_aquisicao, 0);
  custo_add := coalesce((p_dados->>'custo_adicional')::numeric, grupo.custo_adicional, 0);
  taxa_mp := coalesce((p_dados->>'taxa_mp_percentual')::numeric, grupo.taxa_mp_percentual, 0);
  taxas_extra := coalesce((p_dados->>'taxas_adicionais_percentual')::numeric, grupo.taxas_adicionais_percentual, 0);
  margem := coalesce((p_dados->>'margem_desejada_percentual')::numeric, grupo.margem_desejada_percentual, case when novo then 30 else 0 end);
  if custo_aq not between 0 and 100000000 or custo_add not between 0 and 100000000
     or taxa_mp not between 0 and 99.99
     or taxas_extra not between 0 and 99.99
     or margem not between 0 and 99.99
     or taxa_mp + taxas_extra + margem >= 100 then
    raise exception 'As porcentagens devem ser de 0 a 99,99 por cento, e a soma das taxas e da margem precisa ficar abaixo de 100 por cento.';
  end if;
  -- O agrupamento deixa de escolher uma opção principal. Todas passam a ter a mesma função.
  update public.produtos set variacao_principal_id=null where id=p_produto_id;
  for entrada in select value from jsonb_array_elements(p_variacoes) loop
    identificador := (entrada->>'id')::uuid;
    registro := public.salvar_variacao(p_produto_id,identificador,
      entrada || jsonb_build_object('atualizado_em_original',entrada->>'atualizado_em'));
  end loop;
  for excluida in select value from jsonb_array_elements(p_excluir) loop
    -- As proteções existentes impedem apagar estoque convertido ou histórico.
    perform public.excluir_variacao_segura(p_produto_id,(excluida->>'id')::uuid,(excluida->>'atualizado_em')::timestamptz);
  end loop;
  select count(*), coalesce(sum(estoque),0) into quantidade,total
  from public.produto_variacoes where produto_id=p_produto_id;
  if quantidade < 1 then raise exception 'Mantenha pelo menos uma opção no cadastro.'; end if;
  if not grupo.controla_variacoes then
    -- A soma é conferida nesta transação, inclusive opções inativas.
    update public.produtos set estoque=total::integer where id=p_produto_id;
  end if;
  update public.produtos set
    nome=btrim(p_dados->>'nome'), categoria=btrim(p_dados->>'categoria'),
    descricao=coalesce(p_dados->>'descricao',''), imagem=null,
    custo_aquisicao=custo_aq, custo_adicional=custo_add, taxa_mp_percentual=taxa_mp,
    taxas_adicionais_percentual=taxas_extra, margem_desejada_percentual=margem,
    controla_variacoes=true, ativo=ativa, atualizado_em=now()
  where id=p_produto_id;

  return jsonb_build_object('id',p_produto_id,'variacoes',quantidade,'estoque',total,'sucesso',true);
end;
$$;
revoke all on function public.salvar_grupo_variacoes(integer,jsonb,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.salvar_grupo_variacoes(integer,jsonb,jsonb,jsonb,boolean) to service_role;

-- Migration: 202611110006_unlimited_pricing_percentages.sql
-- Remove o teto armazenado dos campos percentuais no cadastro unificado.
-- Não atualiza preços, estoques, produtos ou pedidos existentes.
alter table public.produtos
  alter column taxa_mp_percentual type numeric using taxa_mp_percentual::numeric,
  alter column taxas_adicionais_percentual type numeric using taxas_adicionais_percentual::numeric,
  alter column margem_desejada_percentual type numeric using margem_desejada_percentual::numeric;

create or replace function public.salvar_grupo_variacoes(
  p_produto_id integer,
  p_dados jsonb,
  p_variacoes jsonb,
  p_excluir jsonb,
  p_ajustar_estoque boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  grupo public.produtos;
  atual public.produto_variacoes;
  entrada jsonb;
  excluida jsonb;
  registro jsonb;
  identificador uuid;
  total bigint;
  quantidade integer;
  novo boolean := p_produto_id is null;
  ativa boolean;
  sequencia text;
  novo_id bigint;
  custo_aq numeric;
  custo_add numeric;
  taxa_mp numeric;
  taxas_extra numeric;
  margem numeric;
begin
  if jsonb_typeof(p_variacoes) is distinct from 'array'
     or jsonb_array_length(p_variacoes) not between 1 and 50
     or jsonb_typeof(p_excluir) is distinct from 'array'
     or coalesce(length(btrim(p_dados->>'nome')),0) not between 1 and 160
     or coalesce(length(btrim(p_dados->>'categoria')),0) not between 1 and 80
     or coalesce(length(p_dados->>'descricao'),0) > 10000 then
    raise exception 'Confira os dados do produto e suas variações.';
  end if;
  if not exists (select 1 from public.categorias where nome=btrim(p_dados->>'categoria')) then
    raise exception 'Selecione uma categoria cadastrada.';
  end if;
  select count(*), coalesce(sum((v->>'estoque')::bigint),0), bool_or((v->>'ativo')::boolean)
  into quantidade, total, ativa from jsonb_array_elements(p_variacoes) v;
  if total < 0 or total > 2147483647 or ativa is null then
    raise exception 'Confira os estoques e a situação das variações.';
  end if;
  if exists (
    select 1 from (
      select v->>'id' as id from jsonb_array_elements(p_variacoes) v where v->>'id' is not null
      union all
      select v->>'id' from jsonb_array_elements(p_excluir) v
    ) ids group by id having count(*) > 1 or id is null
  ) then raise exception 'Variações repetidas ou inválidas na edição.'; end if;

  if novo then
    if jsonb_array_length(p_excluir) <> 0 or exists (select 1 from jsonb_array_elements(p_variacoes) v where v->>'id' is not null) then
      raise exception 'Um produto novo deve conter somente opções novas.';
    end if;
    -- Sequências antigas podem estar atrás dos IDs importados. Nunca reutiliza nem sobrescreve um cadastro.
    sequencia := coalesce(pg_get_serial_sequence('public.produtos','id'), to_regclass('public.produtos_id_seq')::text);
    if sequencia is null then raise exception 'A sequência de produtos precisa ser configurada.'; end if;
    loop
      novo_id := nextval(sequencia::regclass);
      if novo_id > 2147483647 then raise exception 'Limite de identificadores de produto atingido.'; end if;
      exit when not exists (select 1 from public.produtos where id=novo_id);
    end loop;
    insert into public.produtos(id,nome,categoria,descricao,preco,estoque,ativo,emoji,imagem)
    values(novo_id::integer,btrim(p_dados->>'nome'),btrim(p_dados->>'categoria'),coalesce(p_dados->>'descricao',''),
      (p_variacoes->0->>'preco')::numeric,total::integer,ativa,'🛍️',null)
    returning * into grupo;
    p_produto_id := grupo.id;
  else
    select * into grupo from public.produtos where id=p_produto_id for update;
    if not found then raise exception 'Produto não encontrado.'; end if;
    if p_dados->>'atualizado_em' is null
       or grupo.atualizado_em is distinct from (p_dados->>'atualizado_em')::timestamptz
       or grupo.estoque is distinct from (p_dados->>'estoque_original')::integer then
      raise exception 'O produto ou o estoque mudou durante a edição. Reabra o cadastro antes de salvar.';
    end if;
  end if;

  -- Confere todo o conjunto, inclusive exclusões, antes de qualquer alteração de opções.
  for atual in select * from public.produto_variacoes where produto_id=p_produto_id order by id for update loop
    select v into entrada from jsonb_array_elements(p_variacoes) v where v->>'id'=atual.id::text;
    select v into excluida from jsonb_array_elements(p_excluir) v where v->>'id'=atual.id::text;
    if entrada is null and excluida is null then
      raise exception 'A lista de variações mudou. Reabra o cadastro antes de salvar.';
    end if;
    registro := coalesce(entrada,excluida);
    if registro->>'atualizado_em' is null
       or atual.atualizado_em is distinct from (registro->>'atualizado_em')::timestamptz then
      raise exception 'Uma variação mudou durante a edição. Reabra o cadastro antes de salvar.';
    end if;
  end loop;
  if exists (
    select 1 from (
      select v from jsonb_array_elements(p_variacoes) v where v->>'id' is not null
      union all select v from jsonb_array_elements(p_excluir) v
    ) escolhidas
    where not exists (select 1 from public.produto_variacoes where id=(v->>'id')::uuid and produto_id=p_produto_id)
  ) then raise exception 'Uma opção não pertence a este produto.'; end if;

  if not grupo.controla_variacoes then
    if exists (
      select 1 from public.itens_pedido i join public.pedidos p on p.id=i.pedido_id
      where i.produto_id=p_produto_id and p.status='aguardando_pagamento' and not p.pedido_teste
    ) or exists (
      select 1 from public.reservas_estoque where produto_id=p_produto_id
      and variacao_id is null and status='reservada' and expira_em>now()
    ) then raise exception 'Produto possui pedidos ou reservas pendentes. Resolva-os antes de converter.'; end if;
    if total <> grupo.estoque and not coalesce(p_ajustar_estoque,false) then
      raise exception 'A soma das opções difere do estoque original. Confira e confirme o ajuste físico antes de salvar.';
    end if;
  end if;

  -- Os custos são compartilhados pelo produto e usados para sugerir o preço de cada opção.
  custo_aq := coalesce((p_dados->>'custo_aquisicao')::numeric, grupo.custo_aquisicao, 0);
  custo_add := coalesce((p_dados->>'custo_adicional')::numeric, grupo.custo_adicional, 0);
  taxa_mp := coalesce((p_dados->>'taxa_mp_percentual')::numeric, grupo.taxa_mp_percentual, 0);
  taxas_extra := coalesce((p_dados->>'taxas_adicionais_percentual')::numeric, grupo.taxas_adicionais_percentual, 0);
  margem := coalesce((p_dados->>'margem_desejada_percentual')::numeric, grupo.margem_desejada_percentual, case when novo then 30 else 0 end);
  if custo_aq not between 0 and 100000000 or custo_add not between 0 and 100000000
     or taxa_mp < 0
     or taxas_extra < 0
     or margem < 0
 then
    raise exception 'Percentuais não podem ser negativos; confira também os custos informados.';
  end if;
  -- O agrupamento deixa de escolher uma opção principal. Todas passam a ter a mesma função.
  update public.produtos set variacao_principal_id=null where id=p_produto_id;
  for entrada in select value from jsonb_array_elements(p_variacoes) loop
    identificador := (entrada->>'id')::uuid;
    registro := public.salvar_variacao(p_produto_id,identificador,
      entrada || jsonb_build_object('atualizado_em_original',entrada->>'atualizado_em'));
  end loop;
  for excluida in select value from jsonb_array_elements(p_excluir) loop
    -- As proteções existentes impedem apagar estoque convertido ou histórico.
    perform public.excluir_variacao_segura(p_produto_id,(excluida->>'id')::uuid,(excluida->>'atualizado_em')::timestamptz);
  end loop;
  select count(*), coalesce(sum(estoque),0) into quantidade,total
  from public.produto_variacoes where produto_id=p_produto_id;
  if quantidade < 1 then raise exception 'Mantenha pelo menos uma opção no cadastro.'; end if;
  if not grupo.controla_variacoes then
    -- A soma é conferida nesta transação, inclusive opções inativas.
    update public.produtos set estoque=total::integer where id=p_produto_id;
  end if;
  update public.produtos set
    nome=btrim(p_dados->>'nome'), categoria=btrim(p_dados->>'categoria'),
    descricao=coalesce(p_dados->>'descricao',''), imagem=null,
    custo_aquisicao=custo_aq, custo_adicional=custo_add, taxa_mp_percentual=taxa_mp,
    taxas_adicionais_percentual=taxas_extra, margem_desejada_percentual=margem,
    controla_variacoes=true, ativo=ativa, atualizado_em=now()
  where id=p_produto_id;

  return jsonb_build_object('id',p_produto_id,'variacoes',quantidade,'estoque',total,'sucesso',true);
end;
$$;
revoke all on function public.salvar_grupo_variacoes(integer,jsonb,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.salvar_grupo_variacoes(integer,jsonb,jsonb,jsonb,boolean) to service_role;

-- Migration: 202611110007_product_image_search.sql

-- Additive migration: no backfill and no UPDATE/DELETE of existing catalog/order rows.
create table public.product_image_searches (
  id uuid primary key default gen_random_uuid(),
  produto_id integer not null references public.produtos(id) on delete cascade,
  variacao_id uuid references public.produto_variacoes(id) on delete cascade,
  criado_em timestamptz not null default now(),
  snapshot jsonb not null,
  status text not null default 'searching' check (status in ('searching','published')),
  metadata jsonb
);
create index product_image_searches_target on public.product_image_searches(produto_id, criado_em desc);
alter table public.product_image_searches enable row level security;
revoke all on public.product_image_searches from public, anon, authenticated;
grant all on public.product_image_searches to service_role;

create function public.begin_product_image_search(p_produto integer, p_variacao uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.produtos; v public.produto_variacoes; s jsonb; search_id uuid;
begin
  select * into p from public.produtos where id=p_produto for update;
  if not found then raise exception 'Produto não encontrado.'; end if;
  if nullif(btrim(p.imagem),'') is not null then raise exception 'Foto existente preservada.'; end if;
  if p_variacao is not null then
    select * into v from public.produto_variacoes where id=p_variacao and produto_id=p.id for update;
    if not found then raise exception 'Variação não encontrada.'; end if;
    if nullif(btrim(v.imagem),'') is not null then raise exception 'Foto existente preservada.'; end if;
  elsif p.controla_variacoes then raise exception 'Selecione uma variação.';
  end if;
  if exists(select 1 from public.product_image_searches where produto_id=p.id and criado_em > now()-interval '60 seconds') then
    raise exception 'Aguarde um minuto entre buscas deste produto.';
  end if;
  s := jsonb_build_object('nome',p.nome,'tipo',coalesce(v.tipo,''),'variacao',coalesce(v.nome,''),'sku',v.sku,
    'produto_atualizado',p.atualizado_em,'variacao_atualizada',v.atualizado_em);
  insert into public.product_image_searches(produto_id,variacao_id,snapshot) values(p.id,p_variacao,s) returning id into search_id;
  return s || jsonb_build_object('search_id',search_id);
end $$;

create function public.publish_product_image(p_search uuid, p_metadata jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.product_image_searches; p public.produtos; v public.produto_variacoes;
begin
  select * into a from public.product_image_searches where id=p_search;
  if not found then raise exception 'Busca não encontrada.'; end if;
  -- Same lock order as the existing variation editor: product, variation, audit.
  select * into p from public.produtos where id=a.produto_id for update;
  if not found then raise exception 'Produto removido.'; end if;
  if a.variacao_id is not null then
    select * into v from public.produto_variacoes where id=a.variacao_id and produto_id=p.id for update;
    if not found then raise exception 'Variação removida.'; end if;
  end if;
  select * into a from public.product_image_searches where id=p_search for update;
  if a.status <> 'searching' or a.criado_em < now()-interval '2 minutes' then raise exception 'Busca expirada ou concluída.'; end if;
  if nullif(btrim(p.imagem),'') is not null or nullif(btrim(v.imagem),'') is not null or
    a.snapshot->>'nome' is distinct from p.nome or
    a.snapshot->>'produto_atualizado' is distinct from to_jsonb(p.atualizado_em)#>>'{}' or
    (a.variacao_id is not null and (a.snapshot->>'variacao' is distinct from v.nome or
      a.snapshot->>'tipo' is distinct from v.tipo or a.snapshot->>'sku' is distinct from v.sku or
      a.snapshot->>'variacao_atualizada' is distinct from to_jsonb(v.atualizado_em)#>>'{}')) then
    raise exception 'Cadastro alterado durante a busca. Foto preservada; reabra o cadastro.';
  end if;
  if coalesce((p_metadata->>'width')::integer,0)<800 or coalesce((p_metadata->>'height')::integer,0)<800 or
    coalesce(p_metadata->>'url','') !~ '^https://[^/@:]+/' or
    coalesce(p_metadata->>'license','')='' or coalesce(p_metadata->>'evidence','')='' or
    (p_metadata->>'commercial')::boolean is distinct from true or (p_metadata->>'hotlink')::boolean is distinct from true then
    raise exception 'Validação incompleta.';
  end if;
  if a.variacao_id is null then
    update public.produtos set imagem=p_metadata->>'url', atualizado_em=now() where id=p.id;
  else
    update public.produto_variacoes set imagem=p_metadata->>'url', atualizado_em=now() where id=v.id;
  end if;
  update public.product_image_searches set status='published',metadata=p_metadata where id=a.id;
  return jsonb_build_object('imagem',p_metadata->>'url','metadata',p_metadata);
end $$;
revoke all on function public.begin_product_image_search(integer,uuid) from public,anon,authenticated;
revoke all on function public.publish_product_image(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.begin_product_image_search(integer,uuid) to service_role;
grant execute on function public.publish_product_image(uuid,jsonb) to service_role;


-- A aplicação usa a API Express com secret no servidor.
alter table public.produtos enable row level security;
alter table public.pedidos enable row level security;
alter table public.itens_pedido enable row level security;
alter table public.categorias enable row level security;
revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Apenas produtos fictícios, sem contatos ou pedidos reais.
insert into public.categorias(nome) values ('Homologação');
insert into public.produtos(nome,categoria,preco,estoque,descricao,emoji)
values ('TESTE — Produto simples','Homologação',10,10,'Produto fictício exclusivo para homologação. Não vender.','🧪'),
       ('TESTE — Produto sem estoque','Homologação',15,0,'Produto fictício para validar indisponibilidade.','🧪'),
       ('TESTE — Produto com opções','Homologação',20,10,'Produto fictício para validar variações.','🧪');
insert into public.produto_variacoes(produto_id,tipo,nome,estoque,preco,ativo)
select id,'cor','Rosa TESTE',5,20,true from public.produtos where nome='TESTE — Produto com opções';
insert into public.produto_variacoes(produto_id,tipo,nome,estoque,preco,ativo)
select id,'cor','Azul TESTE',5,22,true from public.produtos where nome='TESTE — Produto com opções';
select public.converter_produto_para_variacoes(id) from public.produtos where nome='TESTE — Produto com opções';
select public.salvar_variacao_principal(p.id,v.id,null::jsonb,p.atualizado_em) from public.produtos p
join public.produto_variacoes v on v.produto_id=p.id where v.nome='Rosa TESTE';
notify pgrst, 'reload schema';
commit;
select 'HOMOLOGACAO_PREPARADA' as resultado,
  (select count(*) from public.produtos) as produtos_ficticios,
  (select count(*) from public.pedidos) as pedidos,
  (select count(*) from public.produto_variacoes) as variacoes;
