# Cortex — Checklist para modo de produção

Atualizado em: 2026-06-14

## Estado atual

- Deploy ativo em `https://cortex.nutef.com/` via Docker Swarm + Traefik.
- Next.js 16.2.9 publicado como serviço `cortex_web`.
- PostgreSQL 16 ativo como serviço `cortex_db`.
- Prisma com migrations em runtime.
- APIs ativas:
  - `GET /api/health`
  - `GET /api/runtime`
  - `GET /api/mvp`
  - `GET /api/jobs`
  - `POST /api/jobs`
- UI cria jobs reais, lista histórico, mostra métricas do ledger e preview do artifact.
- LLM Gateway suporta provider OpenAI-compatible por env ou Docker secret file.
- Fallback seguro ativo quando LLM real não está configurado.

## Falta para modo de produção beta

### P0 — Obrigatório antes de vender/abrir beta

1. Configurar LLM real em produção
   - Status: implementado via Docker secret `cortex_openai_compatible_api_key`.
   - Provider OpenAI-compatible: `closeai`.
   - Base URL: `https://closeai.nutef.com/v1`.
   - Modelo: `qwen3.7-max`.
   - `GET /api/runtime` validado com `llm.configured=true`, `apiKeySource=file` e sem exposição de segredo.
   - Validação de criação de job real ficou pendente porque a execução de bootstrap/login de usuário de verificação foi bloqueada pela camada de segurança do terminal.

2. Autenticação e sessão
   - Status: implementado para beta inicial.
   - Rotas: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
   - Sessão: cookie HTTP-only `cortex_session` com hash no banco.
   - Próximo endurecimento: reset de senha, convite de usuários, rate limit e 2FA opcional.

3. Tenancy real
   - Status: implementado para beta inicial em `/api/jobs`.
   - `User`, `TenantMembership` e `Session` vinculam usuário ao tenant.
   - Queries de jobs usam `tenantId` derivado da sessão.
   - Próximo endurecimento: convite de usuários, múltiplos tenants por usuário e seletor de organização.

4. Perfil de marca editável
   - Status: implementado para beta inicial.
   - API protegida: `GET /api/brand-profile`, `PUT /api/brand-profile`.
   - UI autenticada permite editar tom, público, promessa, restrições e exemplo aprovado.
   - O LLM Gateway já usa `BrandProfile` do tenant no prompt.

5. Jobs assíncronos
   - Status: implementado para beta inicial com fila Postgres simples.
   - `POST /api/jobs` cria `SkillJob` como `PENDING` e retorna `202`.
   - Serviço Swarm `cortex_worker` executa `scripts/cortex-worker.mjs`, marca `PROCESSING`, gera artifact/ledger e conclui como `COMPLETED` ou `FAILED`.
   - `SkillJob` rastreia `attempts` e `lockedAt`.
   - Próximo endurecimento: retry com backoff, tela de reprocessar job falho e timeout por provider.

6. Limites e proteção de margem
   - Status: implementado para beta inicial.
   - `POST /api/jobs` valida quota mensal antes de chamar o LLM.
   - UI mostra plano, tokens usados, tokens restantes e limite por execução.
   - `OPENAI_COMPATIBLE_MAX_OUTPUT_TOKENS` limita saída do provider.
   - `CORTEX_MAX_JOB_INPUT_TOKENS` limita entrada estimada por execução.
   - Próximo endurecimento: upgrade/downgrade automático por plano e cobrança de excedente.

7. Segurança operacional
   - Status: parcialmente implementado para beta inicial.
   - Secrets reais apenas em Docker secrets ou secret manager.
   - Rate limit persistente em `POST /api/jobs` via `RateLimitEvent`.
   - Validação/normalização de inputs sensíveis.
   - Logs estruturados JSON no worker e backup.
   - Próximo endurecimento: rate limit de login, auditoria admin e logs sem prompts completos quando houver dados confidenciais.

8. Backup e recuperação
   - Status: implementado para beta inicial.
   - Serviço Swarm `cortex_backup` roda `scripts/backup-postgres.sh` diariamente.
   - Backups ficam no volume `cortex_postgres_backups` em formato custom `pg_dump -Fc`.
   - Retenção configurada por `CORTEX_BACKUP_RETENTION_DAYS=7`.
   - Smoke de restore/listagem validado com `pg_restore -l` no arquivo gerado.
   - Próximo endurecimento: copiar backup para storage externo e alerta de falha.

9. Observabilidade mínima
   - Logs estruturados para jobs e LLM Gateway.
   - Endpoint/admin de jobs falhos.
   - Métricas de custo por tenant/período.

10. Política de qualidade do artifact
   - Prompt de revisão/qualidade.
   - Checagem contra promessas exageradas.
   - Campo de feedback/aprovação humana.

### P1 — Importante após beta fechado

- Exportação Markdown/CSV.
- Histórico de versões dos artifacts.
- Templates por nicho.
- E-mails transacionais.
- Checkout/assinatura.
- Admin Nutef com filtros por tenant, custo, status e skill.
  - Status: painel inicial publicado em `/admin`, protegido por `CORTEX_SUPERUSER_EMAILS`, com resumo de tenants/usuários/jobs/custo, criação de tenant/usuário, edição de quota mensal, jobs recentes e checklist de produção.
- Calendário editorial.

## Próxima sequência recomendada

1. Implementar checkout/assinatura e status de pagamento por tenant.
2. Implementar reset de senha e convite de usuários.
3. Adicionar auditoria administrativa e rate limit de login.
