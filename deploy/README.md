# Deploy Cortex

Domínio de produção: https://cortex.nutef.com/

## Stack atual

- App: Next.js em `/root/cortex/app`
- Imagem Docker local: `cortex:latest`
- Serviço web Docker Swarm: `cortex_web`
- Banco dedicado: `cortex_db` (`postgres:16-alpine`)
- Secret Docker: `cortex_postgres_password`
- Volume do banco: `cortex_cortex_postgres_data`
- Rede Traefik: `Nutef`
- Stack file: `/root/cortex/deploy/cortex-stack.yml`
- Reverse proxy: Traefik com Let's Encrypt (`letsencryptresolver`)
- ORM/migrations: Prisma em `/root/cortex/app/prisma`

## Validar localmente antes de publicar

```bash
cd /root/cortex/app
npm run test:smoke
npm run lint
npm run build
```

## Build e deploy

```bash
cd /root/cortex/app
docker build -t cortex:latest .
docker stack deploy -c /root/cortex/deploy/cortex-stack.yml cortex
```

## Verificação em produção

```bash
docker service ps cortex_web --no-trunc
docker service ps cortex_db --no-trunc
docker service logs cortex_web --tail 80 --raw
curl -I https://cortex.nutef.com/
curl -sS https://cortex.nutef.com/api/health
curl -sS https://cortex.nutef.com/api/jobs
curl -L https://cortex.nutef.com/ | grep -o '<title>[^<]*</title>' | head -1
```

Resultado esperado:

- HTTP `200` em `https://cortex.nutef.com/`
- Health API: `{"ok":true,"app":"cortex","database":"ok",...}`
- Jobs API retorna `jobs` e `metrics`
- Título: `Cortex — Núcleo de conteúdo autônomo`
- Certificado Let's Encrypt válido para `cortex.nutef.com`

## API MVP atual

- `GET /api/health`: valida app + conexão PostgreSQL.
- `GET /api/mvp`: retorna tenant demo, jobs recentes e métricas.
- `GET /api/jobs`: retorna jobs e métricas.
- `POST /api/jobs`: cria briefing, job concluído, artifact markdown e ledger de uso determinístico para validar o fluxo de dados real.
- LLM Gateway: `src/lib/llm-gateway.ts` usa provider OpenAI-compatible quando `OPENAI_COMPATIBLE_API_KEY` e `OPENAI_COMPATIBLE_BASE_URL` estão configurados; sem chave, usa fallback determinístico seguro e registra `provider`, `model`, tokens, custo e status no ledger.
- UI `/`: console interativo "Criar pacote real" chama `POST /api/jobs`, recarrega `GET /api/jobs`, lista jobs recentes, mostra métricas e pré-visualiza o artifact markdown.

## Configurar LLM real

Definir no ambiente do serviço web, preferencialmente via secret para a chave:

- `OPENAI_COMPATIBLE_API_KEY`
- `OPENAI_COMPATIBLE_BASE_URL` — exemplo: `https://api.openai.com/v1`
- `OPENAI_COMPATIBLE_MODEL` — exemplo: `gpt-4o-mini`
- `OPENAI_COMPATIBLE_PROVIDER` — nome lógico do provedor
- `OPENAI_COMPATIBLE_INPUT_COST_PER_1M` — opcional para custo estimado
- `OPENAI_COMPATIBLE_OUTPUT_COST_PER_1M` — opcional para custo estimado

Sem essas variáveis, o Cortex continua funcional com `provider=internal-mvp`, `model=deterministic-template-v1` e `status=fallback`.

## Observação de segurança

`npm audit --omit=dev` reporta vulnerabilidade moderada herdada por `next@16.2.9` via `postcss <8.5.10`. `npm audit fix` já removeu vulnerabilidades corrigíveis do Prisma; `npm audit fix --force` ainda propõe downgrade quebrado para `next@9.3.3`, então não foi aplicado. Revisar quando houver release estável do Next corrigindo a cadeia.
