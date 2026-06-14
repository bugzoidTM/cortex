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
   - Escolher estratégia inicial: NextAuth/Auth.js, Clerk, Supabase Auth ou auth própria simples.
   - Proteger rotas de criação/listagem de jobs.
   - Separar usuário interno Nutef de cliente.

3. Tenancy real
   - Remover dependência do tenant demo fixo `nutef-demo`.
   - Criar tenant por organização/cliente.
   - Garantir que cada query filtre por `tenantId` derivado da sessão.

4. Perfil de marca editável
   - Tela/API para criar e atualizar voz da marca.
   - Usar perfil real do tenant no prompt do LLM Gateway.
   - Registrar exemplos aprovados e restrições por marca.

5. Jobs assíncronos
   - Trocar execução síncrona do `POST /api/jobs` por fila/worker.
   - Recomendado: Redis + BullMQ ou Postgres queue simples no MVP.
   - Estados reais: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `CANCELLED`.

6. Limites e proteção de margem
   - Validar quota mensal antes de criar job.
   - Definir limite de tokens por execução.
   - Estimar custo antes/depois do job.
   - Bloquear ou degradar plano quando quota acabar.

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
2. Implementar auth mínima.
3. Transformar tenant demo em tenant por sessão.
4. Adicionar edição de perfil de marca.
5. Converter jobs para fila/worker.
