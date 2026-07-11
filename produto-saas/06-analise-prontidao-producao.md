# Cortex SaaS — Análise de prontidão para produção

> **Atualização 2026-07-10 (rodada de correções pré-lançamento):** este documento descreve o estado de 2026-06-14 e está superado em vários pontos. Desde então foram implementados: checkout Woovi self-service com retomada de checkout abandonado e upgrade de trial; renovação mensal com invoice EXPIRED + re-cobrança automática (inclusive inadimplente) e carência real de 5 dias; cancelamento self-service (cancelAtPeriodEnd → CANCELED) e bloqueio de CANCELED; **trial self-service de 14 dias** (`/api/auth/register`, geração exige BYOK, expira sozinho); LLM honesto (falha transitória → retry → FAILED com alerta; fallback só sem config, sem consumir quota; sampleContent e 5 ganchos + checklist no prompt); reclaim de jobs PROCESSING órfãos; heartbeat + healthcheck do worker; alertas por e-mail (CORTEX_ALERT_EMAIL) em job falho/fallback/backup/webhook órfão; `/api/mvp` e `/api/runtime` fechados (sessão/superuser); headers de segurança; token de reset redigido no EmailMessage; exclusão de conta self-service + purga de retenção (e-mails 90d, sessões, rate-limit); robots.txt/sitemap.xml; termos/privacidade com cancelamento/arrependimento/exclusão (revisão jurídica ainda pendente); limites de memória e deploy.sh fail-fast. Pendências que permanecem: revisão jurídica humana, monitor de uptime externo, error tracking (Sentry), preços reais do modelo no painel admin, og:image.

Análise feita em: 2026-06-14
Base: revisão estática do código em `app/`, da stack em `deploy/` e da documentação em `produto-saas/`.
Observação: a análise foi feita lendo o código. Não foi executado build/deploy ao vivo nem testado o ambiente `cortex.nutef.com` durante esta revisão.

---

## Veredito rápido

O Cortex tem uma **base de SaaS sólida e honesta**: multi-tenant real, sessão segura com hash, fila de jobs com worker, ledger de uso, quota por tenant, admin protegido por superuser, backup diário e fallback determinístico quando o LLM não responde. Isso já é mais maduro que a maioria dos MVPs.

Porém **ainda não está pronto para "modo de produção" no sentido de vender/abrir para clientes pagantes.** Faltam itens em três frentes: (1) o caminho real de geração via LLM nunca foi validado ponta a ponta, (2) a proteção de margem/custo está desligada na prática, e (3) faltam itens legais (LGPD) e operacionais (alertas, backup externo) obrigatórios para um produto cobrando de terceiros no Brasil.

**Resumo:** dá para abrir um **beta fechado por convite** com poucos ajustes (P0 abaixo). Para **vender publicamente** falta mais (P1/legal).

---

## Status da implementação (atualizado 2026-06-14)

Implementado nesta rodada (build + lint + 10 testes de contrato verdes):

- [x] **P0-2 — Custo na stack:** `OPENAI_COMPATIBLE_INPUT_COST_PER_1M` / `_OUTPUT_COST_PER_1M` adicionados ao `web` e `worker` em `deploy/cortex-stack.yml`. **Ação pendente da Nutef:** trocar os valores placeholder (1.00 / 4.00) pelo preço real do `qwen3.7-max`.
- [x] **P0-3 — Rate limit de login:** por IP (30/15min) e por e-mail (10/15min), contando só tentativas que falham. Em `login/route.ts` e `rate-limit.ts`.
- [x] **P0-4 — Timeout do LLM:** `AbortController` (`OPENAI_COMPATIBLE_TIMEOUT_MS`, default 60s) em `llm-gateway.ts` + retry: job com erro transitório volta para `PENDING` até esgotar tentativas (`cortex-mvp.ts`).
- [x] **P0-5 — CI:** workflow `.github/workflows/ci.yml` (lint + testes + build).
- [x] **P0-6 — Termos + Privacidade:** páginas `/termos` e `/privacidade` (LGPD, com subprocessador de IA) + rodapé na landing. **Pendente:** revisão jurídica e preencher contatos/CNPJ.
- [~] **P0-1 — Validar LLM real ponta a ponta:** criado o script `npm run verify:llm-e2e` que falha se cair no fallback. **Falta a Nutef rodá-lo no ambiente de produção** (não executável a partir deste repositório).

P1 implementado nesta rodada:

- [x] **P1-7 — Backup offsite + alerta:** `backup-postgres.sh` copia via `rclone` (se `CORTEX_BACKUP_RCLONE_REMOTE` setado) e alerta falhas; `rclone` adicionado à imagem. **Pendente da Nutef:** configurar o remoto/credenciais.
- [x] **P1-8 — Observabilidade/alertas:** helper `alerts.ts` + webhook (`CORTEX_ALERT_WEBHOOK_URL`) em job falho e erro do worker (throttle 5 min). Uptime externo no `/api/health` documentado (recomendação).
- [x] **P1-9 — Healthchecks:** `db` (`pg_isready`) e `web` (`/api/health`) no `cortex-stack.yml`.
- [x] **P1-10 — Runtime do worker:** `prisma` e `tsx` movidos para `dependencies` (deixam de depender de devDeps na imagem). Compilação total do worker fica como evolução futura.

Pendências de decisão da Nutef: preço real do modelo (P0-2), valor default de `monthlyQuota`, rodar a verificação E2E (P0-1), configurar webhook de alerta, remoto de backup e uptime externo.

---

## O que já está pronto (fundação)

- Multi-tenant real: `User → TenantMembership → Tenant`, queries de job derivam `tenantId` da sessão (`src/app/api/jobs/route.ts`).
- Autenticação com cookie HTTP-only, senha em `scrypt`, token de sessão com hash no banco (`src/lib/auth.ts`).
- Fila assíncrona: `POST /api/jobs` cria `SkillJob` PENDING (202); worker (`src/lib/job-worker.ts`) processa, gera artifact e ledger.
- Quota mensal por tenant e limite de input por job (`src/lib/cortex-mvp.ts`).
- Rate limit persistente em criação de job (`src/lib/rate-limit.ts`).
- Admin Nutef protegido por `CORTEX_SUPERUSER_EMAILS` (`src/app/api/admin/route.ts`).
- LLM Gateway com provider OpenAI-compatible + fallback determinístico seguro (`src/lib/llm-gateway.ts`).
- Backup diário PostgreSQL via serviço Swarm `cortex_backup`.
- Deploy com Traefik + HTTPS Let's Encrypt; migrations rodam no startup do container web.
- Segredos via Docker secrets (senha do banco e chave do LLM).

---

## P0 — Bloqueadores antes de abrir qualquer beta

### 1. O caminho real do LLM nunca foi validado ponta a ponta
O próprio checklist (`05-producao-checklist.md`) admite: *"Validação de criação de job real ficou pendente porque a execução de bootstrap/login… foi bloqueada."* A função central do produto — gerar um pacote real via `closeai.nutef.com` — não tem confirmação de que conclui. Há risco de o sistema estar caindo silenciosamente no **fallback determinístico** (que sempre "funciona", mascarando falha do LLM real).
**Ação:** rodar `bootstrap-admin`, logar, criar 1 job real e confirmar no ledger `status=completed` (não `fallback`) com tokens reais > 0.

### 2. Proteção de margem/custo está desligada na prática
`estimateCostUsd` depende de `OPENAI_COMPATIBLE_INPUT_COST_PER_1M` e `..._OUTPUT_COST_PER_1M`, **que não estão definidos na stack** (`deploy/cortex-stack.yml`). Resultado: todo `costUsd` gravado é **0**. O dashboard mostra "Custo USD: 0" mesmo gastando dinheiro real na API. A única barreira é a quota de tokens, cujo default é **1.000.000 tokens/mês** (alto). Ou seja, a promessa de "controle de custo / proteção de margem" não está ativa.
**Ação:** definir as duas variáveis de custo na stack (web e worker), revisar o default de `monthlyQuota` para um valor condizente com o plano beta.

### 3. Login sem proteção contra força bruta
`POST /api/auth/login` (`src/app/api/auth/login/route.ts`) **não tem rate limit** — diferente de `/api/jobs`. Conta exposta a brute-force/credential stuffing. O checklist reconhece como pendente.
**Ação:** aplicar `checkRateLimit` por e-mail/IP no login antes de abrir para usuários externos.

### 4. Sem timeout/retry resiliente no job
- O `fetch` ao LLM em `llm-gateway.ts` **não tem timeout (AbortController)**: uma chamada travada bloqueia o único worker indefinidamente.
- Job `FAILED` é terminal: não há requeue automático com backoff nem tela para reprocessar. Uma instabilidade transitória do LLM falha o pacote do cliente de forma definitiva e silenciosa.
**Ação:** adicionar timeout por provider e uma política de retry/dead-letter + visibilidade de jobs falhos.

### 5. Sem verificação automatizada de build/teste (CI)
Não há workflow de CI (`.github` ausente); os testes são scripts node manuais que exigem banco; `node_modules` nem está instalado localmente. **Não há garantia de que a árvore atual builda.** Para produção é preciso um gate automático (build + lint + testes de contrato).
**Ação:** criar pipeline que roda `npm run build`, `npm run lint` e os `test:*` contra um Postgres efêmero.

### 6. Itens legais — LGPD (crítico para o público-alvo brasileiro)
A Fase 3 do roadmap exige *"termos simples e política de privacidade inicial"* — **não existem**. O produto processa dados de clientes e os **envia a um LLM de terceiro** (`closeai.nutef.com`). Sem política de privacidade, termos de uso, base legal/consentimento e caminho de exclusão de dados, há risco de LGPD ao cobrar de empresas brasileiras.
**Ação:** publicar Termos de Uso + Política de Privacidade (incluindo o subprocessador de IA) e um caminho de exclusão de conta/dados.

---

## P1 — Importante logo após o beta fechado

### 7. Backup só existe no mesmo VPS
`cortex_backup` grava no volume `cortex_postgres_backups` **no mesmo host**. Se o VPS morrer, o backup morre junto. Sem cópia offsite, sem alerta de falha de backup, sem ensaio de restore automatizado.
**Ação:** enviar dump para storage externo (S3/Backblaze/rsync) e alertar em falha.

### 8. Observabilidade e alertas inexistentes
Há logs JSON estruturados, mas **nenhum alerta**: ninguém é avisado se o worker cair, se jobs empilharem, se o backup falhar ou se a taxa de fallback do LLM disparar. Sem error tracking (ex. Sentry) nem monitor de uptime.
**Ação:** uptime monitor no `/api/health`, captura de erros e alerta para fila/worker/backup.

### 9. Healthchecks não conectados ao orquestrador
Existe `GET /api/health` validando o banco, mas a stack Swarm **não tem blocos `healthcheck`**. O Swarm não sabe reiniciar um container "vivo mas quebrado". Migrations rodam no CMD do container web (corrida se um dia escalar réplicas).
**Ação:** adicionar `healthcheck` aos serviços; isolar migration de runtime ao escalar.

### 10. Worker roda TypeScript via `tsx` em produção
`scripts/cortex-worker.mjs` chama `npx tsx src/lib/job-worker.ts` — roda TS não compilado com uma dependência de dev em runtime. Funciona (a imagem carrega `node_modules` completo), mas é frágil para produção. A arquitetura previa Redis para fila; hoje é poll no Postgres (ok para baixo volume).
**Ação:** compilar o worker ou rodar via build; reavaliar Redis quando o volume crescer.

---

## Lacunas de escopo do MVP (produto incompleto vs. o que foi prometido)

- **Sem cadastro self-service:** só existe login. Usuários são criados via `bootstrap-admin` ou painel admin. Ok para beta por convite; bloqueia beta aberto. (Escopo lista "Login e cadastro".)
- **App é uma landing + console embutido:** não há dashboard autenticado real, fluxo de onboarding, tela de aprovação/edição nem calendário editorial — todos no escopo "Inclui" e nas telas da Fase 1. Hoje login, criar job e editar voz da marca vivem dentro de um componente na landing (`cortex-job-console.tsx`); só `/admin` é página própria.
- **Aprendizado de voz e revisão de qualidade ausentes:** o backlog deixa "prompt de análise de voz" e "prompt de revisão/qualidade" desmarcados; a entidade `VoiceSample` da arquitetura nem está no schema. A promessa de "aprender a voz a partir de exemplos" virou campos manuais de formulário. A política de qualidade do artifact (P0 item 10 do checklist) não está implementada.
- **Sem reset de senha / convite / e-mail transacional:** sem e-mail não há recuperação de conta nem convite de usuário.
- **Sem checkout/cobrança:** esperado para depois, mas obrigatório antes de cobrar (roadmap delega a Kiwify/Hotmart).

---

## Sequência recomendada

**Para abrir beta fechado por convite (1–2 semanas de trabalho):**
1. Validar 1 job real ponta a ponta com LLM (P0-1).
2. Ligar custo na stack + ajustar quota default (P0-2).
3. Rate limit no login (P0-3).
4. Timeout no fetch do LLM + reprocessar job falho (P0-4).
5. Publicar Termos + Política de Privacidade (P0-6).
6. CI mínimo: build + lint + testes (P0-5).

**Para vender publicamente (depois do beta):**
7. Backup offsite + alertas (P1-7, P1-8).
8. Healthchecks no Swarm (P1-9).
9. Cadastro self-service + reset de senha + e-mail (escopo MVP).
10. Telas reais: onboarding, aprovação/edição, calendário (escopo MVP).
11. Checkout/assinatura.
