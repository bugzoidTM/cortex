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
   - Criar Docker secret para `OPENAI_COMPATIBLE_API_KEY`.
   - Definir `OPENAI_COMPATIBLE_BASE_URL`.
   - Definir modelo e custos por 1M tokens.
   - Validar `GET /api/runtime` com `llm.configured=true`.
   - Criar job real e confirmar ledger com provider/model reais.

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
   - Trocar execução síncrona do `POST /api/jobs` por fila/worker.
   - Recomendado: Redis + BullMQ ou Postgres queue simples no MVP.
   - Estados reais: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `CANCELLED`.

6. Limites e proteção de margem
   - Status: implementado para beta inicial.
   - `POST /api/jobs` valida quota mensal antes de chamar o LLM.
   - UI mostra plano, tokens usados, tokens restantes e limite por execução.
   - `OPENAI_COMPATIBLE_MAX_OUTPUT_TOKENS` limita saída do provider.
   - `CORTEX_MAX_JOB_INPUT_TOKENS` limita entrada estimada por execução.
   - Próximo endurecimento: upgrade/downgrade automático por plano e cobrança de excedente.

7. Segurança operacional
   - Secrets reais apenas em Docker secrets ou secret manager.
   - Rate limit em `POST /api/jobs`.
   - Validação/normalização de inputs sensíveis.
   - Logs sem prompts completos quando houver dados confidenciais.

8. Backup e recuperação
   - Script de backup PostgreSQL diário.
   - Teste de restore documentado.
   - Retenção mínima de backups.

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
- Calendário editorial.

## Próxima sequência recomendada

1. Configurar LLM real via Docker secret e validar `llm.configured=true`.
2. Converter jobs para fila/worker.
3. Adicionar rate limit em `POST /api/jobs`.
4. Implementar backup PostgreSQL diário e teste de restore.
