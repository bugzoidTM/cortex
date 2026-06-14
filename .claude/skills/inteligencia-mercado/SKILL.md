---
name: inteligencia-mercado
description: >
  Agente autônomo de inteligência de mercado da Nutef. Roda uma varredura diária e produz
  um relatório estratégico: novas ferramentas de IA, tendências emergentes, oportunidades de
  negócio online, programas de afiliados, nichos pouco explorados, produtos digitais em alta,
  análise de vídeos virais (YouTube/TikTok), padrões de crescimento, 20 ideias de conteúdo e
  10 ideias de produto digital — tudo priorizado para o mercado brasileiro e organizado por
  potencial de lucro. Use quando o usuário pedir "rodar inteligência de mercado",
  "/inteligencia-mercado", "relatório de oportunidades do dia" ou quiser automatizar isso.
---

# /inteligencia-mercado — Agente de inteligência de mercado

Objetivo: **ajudar a crescer o negócio em foco** (hoje, o produto **Cortex** — ver
`marketing/cortex/02-plano-negocio.md` e `_memoria/estrategia.md`). Todo dia, varrer o mercado,
filtrar pelo que serve ao Brasil e ao Cortex, e entregar um relatório estratégico acionável.

Respeitar o tom da casa: formal e polido, sem jargão de guru (`_memoria/preferencias.md`).

---

## Princípios

- **Acionável, não enciclopédico.** Cada item precisa responder "e daí, o que eu faço com isso?".
- **Filtro Brasil.** Priorizar o que tem demanda, idioma e meios de pagamento no mercado brasileiro.
- **Filtro Cortex.** Marcar o que se conecta direto ao produto/posicionamento atual.
- **Fonte e data.** Todo achado leva link e data; não inventar números — se for estimativa, dizer.
- **Priorizar por lucro.** Ordenar oportunidades por potencial de receita × facilidade de execução.

---

## Procedimento diário

> Usar `WebSearch`/`WebFetch` para coletar. Rodar buscas em PT e EN. Limitar a ~12–18 buscas
> para manter foco e custo. Datar tudo com a data corrente.

### Bloco 1 — Coleta (varredura)
1. **Ferramentas de IA novas** — lançamentos/updates da semana relevantes para criação de conteúdo e marketing.
2. **Tendências emergentes** — temas subindo em IA, produtividade, automação, criação e trabalho remoto.
3. **Oportunidades de negócio online** — modelos/ângulos ganhando tração (com viés Brasil).
4. **Programas de afiliados relevantes** — ferramentas de IA/marketing com comissão boa (atenção a recorrente).
5. **Nichos pouco explorados** — sub-temas com demanda e baixa concorrência de conteúdo.
6. **Produtos digitais em crescimento** — formatos/ofertas vendendo bem (Hotmart/Kiwify/Gumroad/AppSumo).
7. **Vídeos virais do YouTube** — 3–5 exemplos no tema; anotar formato, gancho e por que performou.
8. **Conteúdos virais do TikTok** — 3–5 exemplos; anotar áudio/trend, gancho e estrutura.

### Bloco 2 — Análise
9. **Padrões de crescimento** — o que se repete entre os virais e tendências (ganchos, formatos, temas).
10. **Cruzamento com o Cortex** — onde cada achado abastece produto, conteúdo, oferta ou aquisição.

### Bloco 3 — Geração
11. **20 ideias de conteúdo** — prontas para o Cortex/Nutef, com plataforma sugerida e gancho.
12. **10 ideias de produto digital** — com público, formato e faixa de preço estimada.

### Bloco 4 — Priorização e entrega
13. **Organizar oportunidades por potencial de lucro** (tabela com score).
14. **Priorizar para o Brasil** (marcar viabilidade local).
15. **Salvar o relatório** em `saidas/inteligencia-mercado/AAAA-MM-DD.md` e mostrar o resumo no chat.

---

## Critério de priorização (score 1–5)

`Potencial de lucro` × `Facilidade de execução (solo)` × `Aderência ao Cortex/Brasil`.
Score final = média ponderada (lucro peso 2, execução peso 1, aderência peso 1). Ordenar do maior para o menor.

---

## Formato do relatório (template)

```markdown
# Inteligência de Mercado — {{DATA}}
> Foco: crescer o Cortex (Nutef). Fontes datadas. Priorizado para o Brasil.

## 1. Resumo executivo (TL;DR)
- 3 a 5 bullets com o que mais importa hoje e a ação recomendada.

## 2. Top oportunidades (ordenadas por potencial de lucro)
| # | Oportunidade | Por quê agora | Brasil? | Conexão Cortex | Lucro | Execução | Score |
|---|---|---|---|---|---|---|---|
| 1 | … | … | ✅/⚠️ | … | 5 | 4 | 4.5 |

## 3. Ferramentas de IA novas
- **Nome** — o que faz · relevância para nós · [link] (data)

## 4. Tendências emergentes
- Tendência — sinal observado · implicação para o Cortex · [link]

## 5. Programas de afiliados relevantes
- Programa — comissão (recorrente?) · público · [link]

## 6. Nichos pouco explorados
- Nicho — demanda × concorrência · ângulo de entrada

## 7. Produtos digitais em crescimento
- Produto/formato — onde vende · faixa de preço · o que copiar/adaptar

## 8. Virais analisados
### YouTube
- Vídeo — gancho · formato · métrica aproximada · lição · [link]
### TikTok
- Vídeo — áudio/trend · gancho · estrutura · lição · [link]

## 9. Padrões de crescimento (o que se repete)
- Padrão 1 … / Padrão 2 …

## 10. 20 ideias de conteúdo
1. [Plataforma] Gancho — ângulo …
… (até 20)

## 11. 10 ideias de produto digital
1. Nome provisório — público · formato · preço estimado · encaixe na escada de valor
… (até 10)

## 12. Ações para hoje (máx. 3)
- [ ] Ação de maior alavancagem 1
- [ ] Ação 2
- [ ] Ação 3
```

---

## Automação (rodar todo dia)

Esta skill é a rotina; para rodar **sozinha todo dia**, agendar a execução:
- **No Claude Code:** usar `/schedule` (rotina cron na nuvem) ou `/loop` para repetição em intervalo.
- Sugestão: 1×/dia de manhã. O relatório fica em `saidas/inteligencia-mercado/` e o resumo é exibido.

> Observação: a varredura depende de busca na web. Sem acesso à web, a skill gera o relatório com
> base no conhecimento disponível e marca claramente o que precisa de validação online.

---

## Regras

- Nunca inventar números, links ou "viral" sem fonte. Sem fonte → marcar como hipótese.
- Cada relatório termina com no máximo 3 ações priorizadas (evitar lista paralisante).
- Sempre relacionar os achados ao foco atual (`_memoria/estrategia.md`); se o foco mudar, seguir o novo foco.
- Manter o histórico: um arquivo por dia, nunca sobrescrever o do dia anterior.
