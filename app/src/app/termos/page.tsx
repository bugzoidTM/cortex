import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Termos de Uso — Cortex",
  description: "Termos de Uso do Cortex, plataforma de geração de pacotes de conteúdo da Nutef.",
};

const LAST_UPDATE = "14 de junho de 2026";
const PROVIDER = "Nutef — Núcleo de Tecnologias Futuras";
const CONTACT_EMAIL = "contato@nutef.com"; // AJUSTAR: confirmar canal oficial de contato.

export default function TermosPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-[#071120] px-6 py-16 text-[#ECEFF4]">
      <Link href="/" className="text-sm font-semibold text-[#F5A623]">← Voltar</Link>
      <h1 className="mt-6 text-4xl font-black tracking-tight">Termos de Uso</h1>
      <p className="mt-2 text-sm text-[#D6D3C4]">Última atualização: {LAST_UPDATE}</p>

      <div className="mt-6 rounded-2xl border border-[#F5A623]/30 bg-[#F5A623]/10 p-4 text-sm leading-6 text-[#F9E6BC]">
        Versão inicial. Este documento deve ser revisado por assessoria jurídica antes da abertura comercial.
      </div>

      <section className="mt-10 space-y-6 text-[15px] leading-7 text-[#D6D3C4]">
        <div>
          <h2 className="text-xl font-bold text-[#ECEFF4]">1. Aceitação</h2>
          <p>
            Ao criar uma conta ou usar o Cortex, fornecido por {PROVIDER}, você concorda com estes Termos. Se não
            concordar, não utilize o serviço.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#ECEFF4]">2. O serviço</h2>
          <p>
            O Cortex é uma ferramenta que gera rascunhos de pacotes de conteúdo a partir de briefings, usando
            inteligência artificial. O resultado é um <strong>apoio</strong> que exige revisão e aprovação humana antes
            de qualquer publicação.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#ECEFF4]">3. Conta e segurança</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>Você é responsável por manter suas credenciais em sigilo e pelas ações feitas na sua conta.</li>
            <li>As contas atuais são criadas mediante convite/aprovação da Nutef (beta).</li>
            <li>Podemos suspender contas que violem estes Termos ou comprometam a segurança da plataforma.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#ECEFF4]">4. Uso aceitável</h2>
          <p>É proibido usar o Cortex para:</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>conteúdo ilegal, difamatório, enganoso ou que viole direitos de terceiros;</li>
            <li>burlar limites de uso, automatizar abuso ou sobrecarregar o sistema;</li>
            <li>tentar acessar dados de outras organizações (tenants).</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#ECEFF4]">5. Conteúdo gerado e responsabilidade</h2>
          <p>
            Você é responsável pelo conteúdo que publica, mesmo quando gerado com auxílio da IA. A IA pode produzir
            informações imprecisas; revise antes de usar. O conteúdo que você insere e o resultado gerado pertencem à
            sua organização.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#ECEFF4]">6. Planos, limites e custo</h2>
          <p>
            O uso é sujeito a limites de plano (ex.: cota mensal de tokens e limite por execução). Durante o beta,
            condições comerciais podem mudar com aviso prévio.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#ECEFF4]">7. Privacidade</h2>
          <p>
            O tratamento de dados pessoais segue nossa{" "}
            <Link href="/privacidade" className="font-semibold text-[#F5A623]">Política de Privacidade</Link>, incluindo o uso
            de provedores de IA como subprocessadores.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#ECEFF4]">8. Garantias e limitação</h2>
          <p>
            O serviço é fornecido &quot;como está&quot;, sem garantia de disponibilidade ininterrupta. Na máxima medida
            permitida em lei, a Nutef não responde por danos indiretos decorrentes do uso do conteúdo gerado.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#ECEFF4]">9. Contato e foro</h2>
          <p>
            Dúvidas: <strong>{CONTACT_EMAIL}</strong>. Estes Termos são regidos pela legislação brasileira.
          </p>
        </div>
      </section>

      <p className="mt-10 text-sm text-[#D6D3C4]">
        Veja também a <Link href="/privacidade" className="font-semibold text-[#F5A623]">Política de Privacidade</Link>.
      </p>
    </main>
  );
}
