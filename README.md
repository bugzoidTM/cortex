# Cortex

> Núcleo de conteúdo autônomo com IA — uma marca da Nutef.

O Cortex é o projeto prioritário da Nutef para transformar a base atual do antigo MazyOS em um produto vendável: primeiro como oferta assistida/produto digital, depois como SaaS multiusuário.

## Promessa

De uma ideia a um mês de conteúdo. No seu tom.

## Direção do produto

O Cortex deve evoluir em três camadas:

1. **Cortex Operacional** — workspace interno para estratégia, marketing, templates e entregáveis.
2. **Cortex Studio** — serviço assistido de implantação para os primeiros clientes, validando oferta e casos reais.
3. **Cortex SaaS** — aplicação multiusuário hospedada em VPS, com onboarding, geração de conteúdo, aprovação, calendário, automações e controle de consumo por cliente.

## Estrutura atual

- `_memoria/` — contexto estratégico da Nutef.
- `identidade/` — identidade visual da Nutef/Cortex.
- `marketing/cortex/` — produto, plano de negócio e landing page.
- `produto-saas/` — especificação do MVP SaaS, arquitetura, roadmap e backlog.
- `saidas/` — relatórios e entregáveis pontuais.
- `.claude/skills/` — skills herdadas do MazyOS que podem virar fluxos internos do Cortex.

## Próximo objetivo

Sair de documentação estratégica para um MVP executável:

- autenticação e multiusuário;
- onboarding de voz/marca;
- geração de pacotes de conteúdo;
- fila de execuções com Codex/agentes;
- revisão/aprovação humana;
- controle de uso por tenant;
- painel administrativo para a Nutef.

## Observação sobre origem

Este repositório nasceu a partir da estrutura MazyOS, mas a direção de produto agora é Cortex/Nutef. Referências antigas devem ser migradas gradualmente conforme os módulos forem transformados em produto real.
