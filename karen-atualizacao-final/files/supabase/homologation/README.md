# Estrutura do banco de homologação

O ZIP recebido tem seis migrations em `supabase/migrations`. O banco novo de homologação foi preparado anteriormente com estrutura base, essas seis migrations e sete atualizações posteriores.

O arquivo `preparar-banco-vazio.sql` preserva exatamente a preparação entregue e testada para esse banco: estrutura, treze migrations e produtos fictícios. Ele serve para reproduzir a homologação em outro projeto vazio e bloqueia a execução quando encontra tabelas ou usuários existentes.

Não execute esse arquivo no projeto atual, no banco original da loja ou como uma atualização. Não foi aplicada nenhuma mudança ao banco remoto nesta revisão. Antes de produção, compare o histórico e a estrutura do banco original com a estrutura exigida pela versão escolhida; não execute `db push` supondo que a cadeia de seis arquivos represente toda a homologação.

O fixture em `tests/fixtures/estrutura-public.sql` é apenas uma estrutura mínima para os testes com PostgreSQL em memória. Não é um instalador de produção nem contém produtos/clientes reais.
