# Karen Beauty Shop — correção das variações v2

Esta atualização complementa a interface entregue em 11/11/2026.

## O que mudou
- A lista tem botões separados: Editar, Ativar/Desativar e Excluir. Ativar/desativar salva imediatamente e não envia o estoque novamente.
- Ao editar, o formulário recebe foco e o botão Salvar variação fica no cabeçalho fixo do formulário, visível também no celular. O botão geral se chama Salvar dados do produto e fica desabilitado enquanto há uma opção em edição.
- O tipo altera o nome do campo, as sugestões e o exemplo: Cor, Tamanho, Fragrância, Acabamento, Kit e Outra opção. O tipo também identifica as opções na página do produto. As cores conhecidas recebem uma amostra ilustrativa; não representam uma colorimetria exata do cosmético.
- Painel com cartões, indicadores de status, botões com hierarquia visual, resumo de estoque, mensagens de erro e confirmação.
- Aviso explícito de rascunho e botão Ativar variações no catálogo. A conversão é explícita, exige soma igual ao estoque original, todas as opções ativas e ausência de pedidos/reservas impeditivos. Não há redistribuição automática nem conversão ao cadastrar uma opção.
- No produto, há opções clicáveis por tipo com foto/cor/nome/preço e indicação de esgotado, além do seletor acessível. Ao voltar à aba da loja, o catálogo é consultado novamente para refletir alterações administrativas.
- Exclusão protegida por versão, estoque e histórico; nova função de banco descrita abaixo. Produtos convertidos só permitem excluir opções com saldo zero, sem histórico e que não sejam a última opção. Use Desativar para preservar estoque e registros. Rascunhos podem ser excluídos sem mexer no estoque geral.
- O código do painel é carregado separadamente do catálogo.

## Instalar sem substituir o projeto inteiro
1. Envie `karen-interface-v2-patch.zip` para `/workspaces/karen-beauty-shop`, que é a pasta original exibida pelo Codespaces.
2. Execute no terminal do Codespaces:

```bash
PASTA_PATCH="$(mktemp -d /workspaces/karen-interface-v2-XXXXXX)"
unzip -n /workspaces/karen-beauty-shop/karen-interface-v2-patch.zip -d "$PASTA_PATCH" &&
node "$PASTA_PATCH/aplicar-interface-v2.mjs" /workspaces/karen-atualizado-2aSQhl/karen-beauty-shop
```

O instalador verifica os arquivos antes de alterar qualquer um, guarda backup e substitui somente os arquivos desta correção. Se detectar mudanças locais diferentes da entrega anterior, para antes da atualização para permitir comparação. Não toca `.env`, `.env.local`, credenciais ou banco. Pode ser repetido; arquivos já atualizados são ignorados.

3. Valide:

```bash
cd /workspaces/karen-atualizado-2aSQhl/karen-beauty-shop
npm test && npm run build
```

4. Reinicie a API e o site nos dois terminais habituais, usando esta pasta. Mantenha o túnel do Windows aberto. Acesse `http://127.0.0.1:5174/admin` e atualize com Ctrl+Shift+R.

## Banco: nova migration somente para exclusão
A proteção de edição `202611110001_safe_variation_edit.sql` já foi confirmada como instalada pelo usuário. Não reaplique as migrations antigas.

A exclusão exige a nova `supabase/migrations/202611110002_delete_variation_safely.sql`, também fornecida como arquivo separado. Ela cria uma função; não exclui registros por conta própria. NÃO foi aplicada remotamente nesta tarefa. A aplicação remota depende de autorização e do processo de backup habitual. Sem ela, os demais recursos funcionam; o botão Excluir informa que a atualização do banco está pendente.

Após aplicação autorizada, confira:

```sql
select to_regprocedure(
  'public.excluir_variacao_segura(integer,uuid,timestamp with time zone)'
) is not null as exclusao_segura_instalada;
```

## Como fazer as opções aparecerem
Abra Produtos → Editar → Variações. Confira as quantidades e as opções cadastradas. Se o aviso mostrar Rascunho, use Ativar variações no catálogo somente após conferir a soma. O backend preserva a soma do estoque original e pode bloquear por pedidos pendentes. Não zere nem aumente quantidades apenas para liberar o botão.

Na página do produto, atualize a aba. O produto e as opções precisam estar ativos; opções esgotadas são mostradas sem permitir compra. Cores, tamanhos e outros tipos são opções de uma mesma variação, não combinações automáticas entre eixos. Se vender Rosa/M e Rosa/G, cada combinação precisa de uma opção e um estoque próprios.

## Verificações desta entrega
- 29 testes aprovados: API, migrações em PostgreSQL isolado, estoque, reservas e Mercado Pago simulado; novos testes de exclusão e autenticação.
- TypeScript e build aprovados, sem aviso de pacote acima de 500 kB.
- Navegador com dados fictícios: seis tipos, nome adaptável, botão Salvar visível no desktop e no celular, edição sem reenvio de estoque, ativação/desativação direta, exclusão, conversão e catálogo atualizado ao retornar à aba.
- Compra simulada aprovada, com ID da variação no checkout. Não foram criados pedidos ou pagamentos reais.
- Lint sem erros; dois avisos de carregamento via efeito React.
- Banco remoto, produtos e pedidos reais não foram alterados. Nada foi publicado.

O ZIP completo também está disponível, mas o patch é o caminho indicado para a pasta já em uso. O guia desta versão prevalece sobre os relatórios antigos preservados no pacote.
