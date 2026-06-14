const flowSteps = [
  {
    label: "01",
    title: "Ensine sua voz",
    description:
      "Cole exemplos, defina público, promessa, restrições e o jeito certo de falar.",
  },
  {
    label: "02",
    title: "Envie uma ideia",
    description:
      "Briefing curto: tema, objetivo, plataforma prioritária e contexto de campanha.",
  },
  {
    label: "03",
    title: "Aprove o pacote",
    description:
      "O Cortex entrega posts, roteiros, ganchos e calendário para revisão humana.",
  },
];

const packageItems = [
  "Post LinkedIn",
  "Roteiro Reels/TikTok",
  "Carrossel em outline",
  "3 legendas curtas",
  "5 ganchos alternativos",
  "E-mail/newsletter",
];

const metrics = [
  ["<20min", "até o primeiro valor"],
  ["12+", "peças por ideia"],
  ["100%", "PT-BR e no tom"],
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#071120] text-[#ECEFF4]">
      <section className="relative isolate px-6 py-8 sm:px-10 lg:px-16">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(27,157,224,0.30),transparent_32%),radial-gradient(circle_at_80%_10%,rgba(245,166,35,0.18),transparent_28%),linear-gradient(135deg,#071120_0%,#0C1A2E_48%,#10243a_100%)]" />
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl border border-[#2487D8]/40 bg-[#142A42] shadow-[0_0_28px_rgba(36,135,216,0.35)]">
              <span className="text-xl font-black text-[#F5A623]">C</span>
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight">Cortex</p>
              <p className="text-xs uppercase tracking-[0.28em] text-[#D6D3C4]">by Nutef</p>
            </div>
          </div>
          <a
            href="#demo"
            className="rounded-full border border-[#F5A623]/40 px-5 py-2 text-sm font-semibold text-[#F5A623] transition hover:bg-[#F5A623] hover:text-[#071120]"
          >
            Ver protótipo
          </a>
        </div>

        <div className="mx-auto grid max-w-7xl gap-12 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-28">
          <div>
            <div className="mb-6 inline-flex rounded-full border border-[#2487D8]/40 bg-[#142A42]/80 px-4 py-2 text-sm text-[#D6D3C4]">
              Núcleo de conteúdo autônomo com IA
            </div>
            <h1 className="max-w-4xl text-5xl font-black leading-[0.95] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
              De uma ideia a um mês de conteúdo. <span className="text-[#F5A623]">No seu tom.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#D6D3C4]">
              O Cortex aprende a voz da marca, transforma briefings em pacotes multiplataforma e mantém humano no circuito para aprovação, calendário e melhoria contínua.
            </p>
            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <a className="rounded-full bg-[#F5A623] px-7 py-4 text-center font-bold text-[#071120] shadow-[0_0_32px_rgba(245,166,35,0.28)] transition hover:scale-[1.02]" href="#onboarding">
                Simular onboarding
              </a>
              <a className="rounded-full border border-[#2487D8]/50 px-7 py-4 text-center font-bold text-[#ECEFF4] transition hover:bg-[#142A42]" href="#pacote">
                Ver pacote gerado
              </a>
            </div>
          </div>

          <div id="demo" className="rounded-[2rem] border border-white/10 bg-[#0C1A2E]/90 p-4 shadow-2xl shadow-black/40 backdrop-blur">
            <div className="rounded-[1.5rem] border border-[#2487D8]/20 bg-[#071120] p-5">
              <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <p className="text-sm text-[#D6D3C4]">Job em execução</p>
                  <p className="text-xl font-bold">1 ideia → pacote semanal</p>
                </div>
                <span className="rounded-full bg-[#F5A623]/15 px-3 py-1 text-sm font-semibold text-[#F5A623]">82%</span>
              </div>
              <div className="space-y-3">
                {packageItems.map((item, index) => (
                  <div key={item} className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#142A42] px-4 py-3">
                    <span>{item}</span>
                    <span className={index < 4 ? "text-[#1B9DE0]" : "text-[#D6D3C4]"}>{index < 4 ? "pronto" : "fila"}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-2xl border border-[#F5A623]/20 bg-[#F5A623]/10 p-4 text-sm leading-6 text-[#F9E6BC]">
                Voz detectada: formal, técnica, humana, sem jargão de guru. CTA recomendado: demonstração prática.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="onboarding" className="px-6 py-16 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 md:grid-cols-3">
            {flowSteps.map((step) => (
              <article key={step.label} className="rounded-[1.5rem] border border-white/10 bg-[#0C1A2E] p-7">
                <p className="mb-6 text-sm font-black text-[#F5A623]">{step.label}</p>
                <h2 className="text-2xl font-bold">{step.title}</h2>
                <p className="mt-4 leading-7 text-[#D6D3C4]">{step.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="pacote" className="px-6 py-16 sm:px-10 lg:px-16">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-[#2487D8]">MVP SaaS</p>
            <h2 className="mt-4 text-4xl font-black tracking-tight">Primeira versão: simples, vendável e controlada.</h2>
            <p className="mt-5 leading-8 text-[#D6D3C4]">
              O próximo bloco é transformar este protótipo em app real: auth, tenant, perfil de voz, jobs de IA, ledger de uso e painel admin da Nutef.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {metrics.map(([value, label]) => (
              <div key={value} className="rounded-[1.5rem] border border-[#2487D8]/20 bg-[#142A42] p-6">
                <p className="text-4xl font-black text-[#F5A623]">{value}</p>
                <p className="mt-3 text-sm leading-6 text-[#D6D3C4]">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
