# Categorias e fotos de produtos

## O que foi preparado

- Página individual em `/produto/:id`, com foto, preço, descrição, estoque, seletor de quantidade, produtos da mesma categoria e uma segunda seção de recomendações.
- Confirmação visual ao adicionar ao carrinho com produto, quantidade e valor; a loja permanece na página e oferece continuar comprando ou abrir o carrinho.
- Painel administrativo com criação, renomeação e exclusão de categorias. A exclusão é recusada quando há produtos vinculados.
- Envio de fotos JPG, PNG ou WebP de até 5 MB pelo painel. Os arquivos são enviados ao bucket `product-photos` e a URL fica na coluna existente `produtos.imagem`.
- Remoção da foto, limpando a URL do produto e removendo o objeto do bucket quando a imagem estiver nesse Storage.
- Cadastro de produtos com categoria existente, além de exclusão protegida contra remoção de produtos que aparecem no histórico de pedidos.
- Chave liga/desliga no estilo iPhone: verde para “Produto ativo” e vermelha para “Produto desativado”.
- Loja pública carrega produtos ativos do banco e mostra a foto quando disponível. A validação do pedido lê preço e estoque atuais do mesmo catálogo.
- Migração que cria a tabela de categorias, importa nela os nomes existentes sem alterar as linhas de produto, adiciona a coluna de foto anulável e cria o bucket público.

## Antes de usar

No Supabase deste projeto, a migração e a coluna `produtos.imagem` já foram aplicadas manualmente. Não execute o arquivo outra vez no projeto atual. Mantenha o arquivo no repositório para documentar a alteração e reproduzi-la em outros ambientes.

O servidor precisa usar uma chave privada de backend com acesso ao Storage e às tabelas. Nunca coloque essa chave no frontend. O bucket configurado por `PRODUCT_PHOTO_BUCKET` deve existir e ser público; se a variável for definida para outro nome, crie esse bucket com as mesmas restrições.

O build desta versão ainda precisa ser executado no Codespace com `npm run build`.
