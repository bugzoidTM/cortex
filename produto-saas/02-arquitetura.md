# Cortex SaaS — Arquitetura Proposta

## Princípios

- Multiusuário desde o início.
- Controle explícito de custo por tenant.
- UX simples: botões, formulários e automações; evitar slash commands para cliente final.
- Codex/agentes como motor interno, não como interface visível ao usuário.
- Separar produto, execução de jobs e camada de conhecimento.
- Começar em VPS com Docker Compose; evoluir para infraestrutura maior só quando houver tração.

## Stack recomendada para MVP

### Frontend

- Next.js com App Router.
- TailwindCSS.
- shadcn/ui para componentes.
- React Hook Form + Zod para formulários.

### Backend

- Next.js API routes/server actions para MVP.
- PostgreSQL para dados persistentes.
- Prisma ou Drizzle como ORM.
- Redis para filas e cache.
- Worker Node.js isolado para execuções de geração.

### Autenticação e multi-tenant

- Auth.js ou Supabase Auth.
- Modelo `User -> Membership -> Organization`.
- Todo dado de produto deve carregar `organizationId`.
- Admin Nutef separado por role.

### Execução com IA

- `AIProvider` abstrato para OpenAI-compatible, Anthropic, OpenRouter e modelos locais no futuro.
- Worker cria jobs assíncronos: `content_generation`, `voice_analysis`, `weekly_report`.
- Codex pode ser chamado como executor interno em ambiente isolado, recebendo prompt, contexto e limites claros.
- Cada job registra modelo, tokens/custo estimado, duração, status e output.

### Persistência de contexto

Entidades principais:

- `Organization`: tenant/empresa.
- `User`: usuário.
- `BrandProfile`: posicionamento, persona, tom, estilo, restrições.
- `VoiceSample`: exemplos de texto do cliente.
- `ContentBrief`: briefing enviado.
- `GenerationJob`: execução assíncrona.
- `ContentPackage`: pacote gerado.
- `ContentItem`: item individual por plataforma.
- `EditorialCalendarItem`: planejamento de publicação.
- `UsageLedger`: consumo por tenant.
- `PlanSubscription`: plano, limites e status.

## Fluxo técnico principal

1. Usuário cria organização.
2. Onboarding coleta marca, público, tom e exemplos.
3. Sistema resume os exemplos em um `VoiceProfile` interno.
4. Usuário cria briefing.
5. API valida limite do plano.
6. API cria `GenerationJob` pendente.
7. Worker busca job, monta contexto e chama motor de IA/Codex.
8. Worker salva `ContentPackage` e itens individuais.
9. Usuário revisa, edita e aprova.
10. Uso/custo é registrado no `UsageLedger`.

## Isolamento e segurança

- Nunca misturar dados sem filtrar por `organizationId`.
- Prompts devem receber apenas contexto do tenant atual.
- Jobs de agente/Codex devem rodar em diretório temporário por tenant/job.
- Bloquear comandos de shell perigosos quando a execução for baseada em agente externo.
- Logar apenas metadados necessários; evitar salvar secrets em prompts.

## Deploy inicial na VPS

Serviços Docker:

- `web`: Next.js.
- `worker`: executor de jobs.
- `postgres`: banco.
- `redis`: fila.
- `caddy` ou `traefik`: HTTPS/reverse proxy.

Volumes:

- banco PostgreSQL;
- uploads/anexos;
- logs operacionais;
- artefatos temporários de jobs, com limpeza automática.

## Variáveis essenciais

- `DATABASE_URL`
- `REDIS_URL`
- `NEXTAUTH_SECRET` ou equivalente
- `APP_URL`
- `AI_PROVIDER`
- `AI_API_KEY`
- `AI_BASE_URL`
- `DEFAULT_MODEL`
- `ADMIN_EMAILS`
- `MONTHLY_TOKEN_LIMIT_DEFAULT`

## Primeira versão sem excesso

O MVP não precisa começar com microserviços, Kubernetes, billing complexo ou integrações com todas as redes. O diferencial inicial é entregar conteúdo útil no tom correto com operação simples e custo controlado.
