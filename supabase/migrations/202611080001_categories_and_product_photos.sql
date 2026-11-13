-- Apply manually in Supabase after reviewing the target project/schema.
-- This migration does not update or replace any existing product rows.
begin;

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

commit;
