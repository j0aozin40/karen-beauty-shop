-- SOMENTE LEITURA. Não aplica migrations nem modifica dados.
select table_name,column_name,data_type,column_default
from information_schema.columns
where table_schema='public' and table_name in ('produtos','produto_variacoes','pedidos','itens_pedido','reservas_estoque')
order by table_name,ordinal_position;

select c.relname as tabela,t.tgname as gatilho,pg_get_triggerdef(t.oid) as definicao
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and not t.tgisinternal
and c.relname in ('produtos','produto_variacoes','pedidos','itens_pedido','reservas_estoque');

select conrelid::regclass as tabela,conname,pg_get_constraintdef(oid) as definicao
from pg_constraint where conrelid in ('public.produtos'::regclass,'public.pedidos'::regclass,'public.itens_pedido'::regclass);

select status,coalesce((to_jsonb(p)->>'pedido_teste')::boolean,false) as pedido_teste,count(*) as quantidade
from public.pedidos p group by 1,2 order by 1,2;
select count(*) as produtos,sum(estoque) as estoque_total from public.produtos;

select grantee,table_name,privilege_type from information_schema.table_privileges
where table_schema='public' and table_name in ('produtos','produto_variacoes','pedidos','itens_pedido','reservas_estoque')
order by table_name,grantee,privilege_type;

-- Conferir também o histórico de migrations no painel Supabase, se existir.
select to_regclass('supabase_migrations.schema_migrations') as historico_migrations;
