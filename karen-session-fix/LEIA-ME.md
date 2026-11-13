# Correção do armazenamento de sessões

Esta correção remove chamadas `.catch()` de builders PromiseLike do Supabase e usa armazenamento em memória somente no processo de testes. Os ambientes de homologação e produção continuam usando o Supabase.

Na raiz do Codespace, extraia este ZIP e execute:

```bash
node karen-session-fix/fix.mjs
npm run build
npm test
```

O instalador cria cópias de segurança locais antes de substituir os arquivos. Não altera `.env`, banco remoto nem Cloudflare.
