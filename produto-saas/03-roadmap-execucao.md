# Cortex SaaS — Roadmap de Execução

## Fase 0 — Organizar base do produto

Objetivo: separar o Cortex do legado MazyOS e transformar documentação em especificação executável.

Entregáveis:

- README reposicionado para Cortex.
- Pasta `produto-saas/` com visão, arquitetura, roadmap e backlog.
- Glossário de entidades e fluxos.
- Lista de referências MazyOS a migrar gradualmente.

Validação:

- Qualquer pessoa entende o que será construído lendo o repositório.

## Fase 1 — Protótipo navegável

Objetivo: simular a UX do cliente antes de construir toda a lógica.

Telas:

- Landing/logado.
- Cadastro/login.
- Onboarding de marca e voz.
- Novo briefing.
- Tela de job em processamento.
- Resultado do pacote de conteúdo.
- Edição/aprovação.
- Calendário editorial.
- Admin Nutef.

Validação:

- Fluxo completo clicável.
- Não precisa IA real ainda; pode usar mock controlado.

## Fase 2 — MVP funcional local

Objetivo: backend real com geração via LLM.

Entregáveis:

- Banco PostgreSQL.
- Auth e multi-tenant.
- CRUD de perfil de marca.
- Job assíncrono de geração.
- Worker com provedor OpenAI-compatible.
- Registro de uso/custo.
- Testes básicos de fluxo.

Validação:

- Criar usuário, configurar voz, gerar pacote, editar e aprovar.

## Fase 3 — Beta fechado

Objetivo: colocar 5–10 usuários reais usando.

Entregáveis:

- Deploy em VPS com HTTPS.
- Painel admin.
- Limites por tenant.
- Logs e alertas básicos.
- Backup do banco.
- Termos simples e política de privacidade inicial.

Validação:

- Usuários geram conteúdo sem intervenção manual da Nutef.
- Nutef consegue ver consumo e corrigir problemas.

## Fase 4 — Oferta Fundadores

Objetivo: vender a primeira turma com produto já funcional.

Entregáveis:

- Checkout externo via Kiwify/Hotmart/Eduzz ou link manual no início.
- Onboarding guiado.
- Sequência de e-mails.
- Página de vendas longa/VSL.
- Material de suporte.

Validação:

- Primeiras vendas e depoimentos reais.

## Fase 5 — Recorrência e retenção

Objetivo: transformar em assinatura saudável.

Entregáveis:

- Planos e limites.
- Billing integrado.
- Templates por nicho.
- Relatório semanal de conteúdo.
- Melhorias de qualidade por feedback.

Validação:

- Usuário retorna semanalmente.
- Churn inicial controlado.

## Próximo bloco recomendado

Construir a Fase 1: protótipo navegável em Next.js, porque reduz risco de UX antes de investir no backend completo.
