# Cortex SaaS — Backlog Priorizado

## P0 — Necessário para MVP

### Produto/UX

- [ ] Criar mapa de navegação do app.
- [ ] Criar wireframes das telas principais.
- [ ] Definir copy do onboarding.
- [ ] Definir pacote padrão de conteúdo gerado.
- [ ] Definir estados de job: pendente, processando, concluído, falhou, cancelado.

### Backend

- [ ] Inicializar app Next.js.
- [ ] Configurar PostgreSQL.
- [ ] Escolher ORM: Prisma ou Drizzle.
- [ ] Implementar autenticação.
- [ ] Implementar organizações/tenants.
- [ ] Implementar perfis de marca.
- [ ] Implementar briefings.
- [ ] Implementar jobs assíncronos.
- [ ] Implementar worker.
- [ ] Implementar ledger de uso.

### IA

- [ ] Criar abstração de provider OpenAI-compatible.
- [ ] Criar prompt de análise de voz.
- [ ] Criar prompt de geração de pacote.
- [ ] Criar prompt de revisão/qualidade.
- [ ] Adicionar limites de tokens por execução.
- [ ] Registrar modelo, tokens e custo estimado por job.

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

1. Criar projeto Next.js em `app/`.
2. Montar layout base com identidade Cortex.
3. Implementar protótipo das telas com dados mockados.
4. Validar fluxo com build local.
5. Só depois ligar banco/autenticação.

## Critério de corte

Se uma tarefa não ajuda o cliente a chegar ao primeiro pacote gerado em menos de 20 minutos, ela fica fora do MVP.
