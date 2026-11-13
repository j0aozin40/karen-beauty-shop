-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

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
