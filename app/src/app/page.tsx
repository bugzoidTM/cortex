import Link from "next/link";
import { CortexJobConsole } from "./components/cortex-job-console";
import { SelfServiceCheckout } from "./components/self-service-checkout";

const outcomes = [
  ["Pacote de conteúdo com IA", "Gere posts, roteiros, carrosséis, legendas e e-mails a partir de um briefing curto."],
  ["Voz da marca", "O Cortex usa tom, público, promessa e restrições cadastradas para reduzir retrabalho."],
  ["Controle de consumo", "Cada execução registra modelo, tokens, custo estimado, status e histórico por tenant."],
];

const howItWorks = [
  {
    label: "01",
    title: "Cadastre a voz da marca",
    description: "Defina tom, público, promessa, restrições e exemplos aprovados. Isso vira contexto para as próximas gerações.",
  },
  {
    label: "02",
    title: "Envie o briefing",
    description: "Informe tema, objetivo, plataforma prioritária e contexto estratégico. O job entra na fila do tenant.",
  },
  {
    label: "03",
    title: "Revise e use o pacote",
    description: "Receba um artifact em Markdown para revisar, adaptar e publicar com aprovação humana.",
  },
];

const packageItems = ["Post para LinkedIn", "Roteiro curto", "Outline de carrossel", "Legendas", "E-mail/newsletter", "Notas de revisão"];

const pricing = [
  ["Teste de 14 dias", "use sua própria chave API", "O usuário pode validar o Cortex com uma chave OpenAI-compatible própria; a chave fica criptografada, mascarada na tela e expira automaticamente ao fim do teste."],
  ["Planos pagos", "LLM gerenciado pela Nutef", "Nos planos pagos, o tenant usa o modelo configurado no painel admin, com quota mensal, custo estimado e limites por execução."],
  ["Operação", "Admin Nutef", "Superadmin acompanha tenants, usuários, modelo LLM, consumo, jobs e custo estimado."],
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
          <nav className="hidden items-center gap-6 text-sm font-semibold text-[#D6D3C4] md:flex">
            <a className="hover:text-[#F5A623]" href="#produto">Produto</a>
            <a className="hover:text-[#F5A623]" href="#como-funciona">Como funciona</a>
            <a className="hover:text-[#F5A623]" href="#planos">Planos</a>
          </nav>
          <a
            href="#acesso"
            className="rounded-full border border-[#F5A623]/40 px-5 py-2 text-sm font-semibold text-[#F5A623] transition hover:bg-[#F5A623] hover:text-[#071120]"
          >
            Entrar no Cortex
          </a>
        </div>

        <div className="mx-auto grid max-w-7xl gap-12 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-28">
          <div>
            <div className="mb-6 inline-flex rounded-full border border-[#2487D8]/40 bg-[#142A42]/80 px-4 py-2 text-sm text-[#D6D3C4]">
              Plataforma de conteúdo com IA para marcas em operação
            </div>
            <h1 className="max-w-4xl text-5xl font-black leading-[0.95] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
              Transforme uma ideia em um pacote de conteúdo. <span className="text-[#F5A623]">Com voz, custo e revisão sob controle.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#D6D3C4]">
              O Cortex ajuda equipes e negócios a gerar conteúdo em português com consistência: briefing, voz da marca, geração por IA, aprovação humana, histórico e controle de consumo no mesmo fluxo.
            </p>
            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <a className="rounded-full bg-[#F5A623] px-7 py-4 text-center font-bold text-[#071120] shadow-[0_0_32px_rgba(245,166,35,0.28)] transition hover:scale-[1.02]" href="#acesso">
                Solicitar acesso
              </a>
              <a className="rounded-full border border-[#2487D8]/50 px-7 py-4 text-center font-bold text-[#ECEFF4] transition hover:bg-[#142A42]" href="#produto">
                O que o Cortex faz
              </a>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-[#0C1A2E]/90 p-4 shadow-2xl shadow-black/40 backdrop-blur">
            <div className="rounded-[1.5rem] border border-[#2487D8]/20 bg-[#071120] p-5">
              <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <p className="text-sm text-[#D6D3C4]">Job de conteúdo</p>
                  <p className="text-xl font-bold">1 briefing → pacote revisável</p>
                </div>
                <span className="rounded-full bg-[#F5A623]/15 px-3 py-1 text-sm font-semibold text-[#F5A623]">IA + humano</span>
              </div>
              <div className="space-y-3">
                {packageItems.map((item, index) => (
                  <div key={item} className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#142A42] px-4 py-3">
                    <span>{item}</span>
                    <span className={index < 4 ? "text-[#1B9DE0]" : "text-[#D6D3C4]"}>{index < 4 ? "gerado" : "incluído"}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-2xl border border-[#F5A623]/20 bg-[#F5A623]/10 p-4 text-sm leading-6 text-[#F9E6BC]">
                Exemplo de regra aplicada: linguagem formal, técnica e humana; sem jargão de guru; conteúdo sempre revisável antes de publicar.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="produto" className="px-6 py-16 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-[#2487D8]">O que o Cortex faz</p>
          <h2 className="mt-4 max-w-3xl text-4xl font-black tracking-tight">Para equipes que precisam publicar com consistência, sem perder o tom da marca.</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {outcomes.map(([title, body]) => (
              <article key={title} className="rounded-[1.5rem] border border-white/10 bg-[#0C1A2E] p-6">
                <h3 className="text-xl font-bold text-[#F5A623]">{title}</h3>
                <p className="mt-4 leading-7 text-[#D6D3C4]">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="como-funciona" className="px-6 py-16 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-[#2487D8]">Como funciona</p>
          <h2 className="mt-4 max-w-3xl text-4xl font-black tracking-tight">Um fluxo simples para transformar briefing em material pronto para revisão.</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {howItWorks.map((step) => (
              <article key={step.label} className="rounded-[1.5rem] border border-white/10 bg-[#0C1A2E] p-7">
                <p className="mb-6 text-sm font-black text-[#F5A623]">{step.label}</p>
                <h3 className="text-2xl font-bold">{step.title}</h3>
                <p className="mt-4 leading-7 text-[#D6D3C4]">{step.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="acesso" className="px-6 py-16 sm:px-10 lg:px-16">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-[#2487D8]">Acesso ao produto</p>
            <h2 className="mt-4 text-4xl font-black tracking-tight">Entre na sua conta ou solicite liberação para a sua marca.</h2>
            <p className="mt-5 leading-8 text-[#D6D3C4]">
              O Cortex usa contas por tenant. Se você já recebeu acesso, faça login abaixo. Se ainda não tem conta, solicite onboarding para configurar marca, quota e usuários. No teste de 14 dias, você pode usar sua própria chave API; nos planos pagos, o LLM gerenciado pela Nutef já vem configurado.
            </p>
            <div className="mt-8 rounded-[1.5rem] border border-[#F5A623]/20 bg-[#F5A623]/10 p-6 text-[#F9E6BC]">
              <h3 className="font-black">Self-service com Pix</h3>
              <p className="mt-3 text-sm leading-6">Novas marcas podem iniciar pelo checkout Woovi. Após confirmação do pagamento, o tenant é liberado automaticamente para usar o console.</p>
            </div>
          </div>
          <div className="grid gap-6">
            <SelfServiceCheckout />
            <CortexJobConsole />
          </div>
        </div>
      </section>

      <section id="planos" className="px-6 py-16 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-[#2487D8]/20 bg-[#0C1A2E] p-8 lg:p-10">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-[#2487D8]">Planos e acesso</p>
          <h2 className="mt-4 max-w-3xl text-4xl font-black tracking-tight">Preço previsível, limite de uso e acompanhamento operacional.</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {pricing.map(([title, value, body]) => (
              <article key={title} className="rounded-2xl border border-white/10 bg-[#071120]/75 p-5">
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#7DC8F5]">{title}</p>
                <h3 className="mt-3 text-2xl font-black text-[#F5A623]">{value}</h3>
                <p className="mt-4 text-sm leading-6 text-[#D6D3C4]">{body}</p>
              </article>
            ))}
          </div>
          <p className="mt-6 text-sm leading-6 text-[#D6D3C4]">
            Para uma proposta comercial, a Nutef define o plano conforme volume esperado, número de marcas/usuários e necessidade de suporte no processo editorial.
          </p>
        </div>
      </section>

      <footer className="px-6 py-10 sm:px-10 lg:px-16">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-sm text-[#D6D3C4] sm:flex-row">
          <p>© {new Date().getFullYear()} Cortex · by Nutef</p>
          <nav className="flex items-center gap-6">
            <Link className="hover:text-[#F5A623]" href="/termos">Termos de Uso</Link>
            <Link className="hover:text-[#F5A623]" href="/privacidade">Política de Privacidade</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
