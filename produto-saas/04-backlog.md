# Cortex SaaS — Backlog Priorizado

## P0 — Necessário para MVP

### Produto/UX

- [x] Criar mapa de navegação do app.
- [x] Criar wireframes das telas principais.
- [x] Definir copy do onboarding.
- [x] Definir pacote padrão de conteúdo gerado.
- [x] Definir estados de job: pendente, processando, concluído, falhou, cancelado.

### Backend

- [x] Inicializar app Next.js.
- [x] Configurar PostgreSQL.
- [x] Escolher ORM: Prisma ou Drizzle.
- [x] Implementar autenticação.
- [x] Implementar organizações/tenants.
- [x] Implementar perfis de marca.
- [x] Implementar briefings.
- [ ] Implementar jobs assíncronos.
- [ ] Implementar worker.
- [x] Implementar ledger de uso.

### IA

- [x] Criar abstração de provider OpenAI-compatible.
- [ ] Criar prompt de análise de voz.
- [x] Criar prompt de geração de pacote.
- [ ] Criar prompt de revisão/qualidade.
- [x] Adicionar limites de tokens por execução.
- [x] Registrar modelo, tokens e custo estimado por job.

### Operação

- [ ] Docker Compose com web, worker, postgres, redis e proxy.
- [ ] Script de backup PostgreSQL.
- [ ] Logs estruturados.
- [ ] Admin Nutef para visualizar usuários, jobs e consumo.

## P1 — Importante após beta

- [ ] Templates por nicho.
- [ ] Exportação Markdown/CSV.
- [ ] Calendário mensal completo.
- [ ] Histórico de versões de cada conteúdo.
- [ ] Feedback do usuário por item: bom, ruim, ajustar tom.
- [ ] Relatório semanal manual/semi-automático.
- [ ] Integração com checkout.
- [ ] E-mails transacionais.

## P2 — Escala

- [ ] Publicação direta em redes sociais.
- [ ] Integração com métricas de plataformas.
- [ ] White-label para agências.
- [ ] Marketplace de templates.
- [ ] Programa de afiliados integrado.
- [ ] Cobrança automática por uso excedente.

## Primeiras tarefas executáveis

1. [x] Criar projeto Next.js em `app/`.
2. [x] Montar layout base com identidade Cortex.
3. [x] Implementar protótipo das telas com dados mockados.
4. [x] Validar fluxo com build local.
5. [x] Ligar banco e fluxo de dados real após consolidar modelo do MVP.
6. [x] Implementar autenticação e tenants reais.
7. [ ] Configurar LLM real via Docker secret.
8. [x] Implementar perfis de marca editáveis.
9. [ ] Converter jobs para fila/worker.

## Critério de corte

Se uma tarefa não ajuda o cliente a chegar ao primeiro pacote gerado em menos de 20 minutos, ela fica fora do MVP.
