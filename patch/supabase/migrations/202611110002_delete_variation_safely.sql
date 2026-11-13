-- Exclusão explícita, preservando inventário e histórico. Não aplicar remotamente sem autorização.
begin;

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

commit;
