begin;
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

commit;
