import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de Privacidade — Cortex",
  description: "Como o Cortex (Nutef) coleta, usa e protege dados pessoais, em conformidade com a LGPD.",
};

const LAST_UPDATE = "14 de junho de 2026";
const CONTROLLER = "Nutef — Núcleo de Tecnologias Futuras";
const CONTACT_EMAIL = "privacidade@nutef.com"; // AJUSTAR: confirmar canal oficial de contato do encarregado.

export default function PrivacidadePage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-[#071120] px-6 py-16 text-[#ECEFF4]">
      <Link href="/" className="text-sm font-semibold text-[#F5A623]">← Voltar</Link>
      <h1 className="mt-6 text-4xl font-black tracking-tight">Política de Privacidade</h1>
      <p className="mt-2 text-sm text-[#D6D3C4]">Última atualização: {LAST_UPDATE}</p>

      <div className="mt-6 rounded-2xl border border-[#F5A623]/30 bg-[#F5A623]/10 p-4 text-sm leading-6 text-[#F9E6BC]">
        Versão inicial. Este documento deve ser revisado por assessoria jurídica antes da abertura comercial.
      </div>

      <section className="prose-invert mt-10 space-y-6 text-[15px] leading-7 text-[#D6D3C4]">
        <div>
          <h2 className="text-xl font-bold text-[#ECEFF4]">1. Quem é o controlador</h2>
          <p>
            O controlador dos dados é {CONTROLLER} (&quot;Cortex&quot;, &quot;nós&quot;). Para qualquer questão sobre
            privacidade ou exercício de direitos, fale com nosso encarregado em <strong>{CONTACT_EMAIL}</strong>.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#ECEFF4]">2. Quais dados coletamos</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li><strong>Cadastro:</strong> nome, e-mail e senha (armazenada apenas como hash, nunca em texto puro).</li>
            <li><strong>Conteúdo de uso:</strong> perfil de voz da marca, briefings, temas, contexto e pacotes gerados.</li>
            <li><strong>Operacionais:</strong> registros de uso, custo estimado, tokens, logs técnicos e endereço IP em eventos de segurança (ex.: limite de login).</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#ECEFF4]">3. Para que usamos</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>Operar a conta, autenticar o acesso e isolar dados por organização (tenant).</li>
            <li>Gerar os pacotes de conteúdo solicitados.</li>
            <li>Controlar consumo, custo e limites de plano.</li>
            <li>Garantir segurança, prevenir abuso e cumprir obrigações legais.</li>
          </ul>
          <p>Base legal (LGPD): execução de contrato, legítimo interesse na segurança e cumprimento de obrigação legal.</p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#ECEFF4]">4. Compartilhamento e subprocessadores de IA</h2>
          <p>
            Para gerar conteúdo, o texto do seu briefing e o perfil de voz da marca são enviados a um
            <strong> provedor de modelo de linguagem (IA)</strong> contratado por nós. Esse provedor processa os dados
            apenas para retornar o resultado da geração. Não vendemos dados pessoais. Não usamos seu conteúdo para
            treinar modelos próprios.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#ECEFF4]">5. Retenção</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>Sessões de login expiram em 14 dias.</li>
            <li>Backups do banco são mantidos por 7 dias.</li>
            <li>Conteúdo e cadastro são mantidos enquanto a conta existir; após exclusão, removemos ou anonimizamos os dados, salvo obrigação legal de retenção.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#ECEFF4]">6. Seus direitos (LGPD)</h2>
          <p>
            Você pode solicitar acesso, correção, portabilidade, anonimização ou exclusão dos seus dados, e revogar
            consentimentos, escrevendo para <strong>{CONTACT_EMAIL}</strong>. Responderemos nos prazos da LGPD.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#ECEFF4]">7. Segurança</h2>
          <p>
            Adotamos medidas como senhas com hash, sessões com token protegido, segredos isolados, limite de tentativas
            de login e backups. Nenhum sistema é 100% imune; comunicaremos incidentes relevantes conforme a lei.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-[#ECEFF4]">8. Alterações</h2>
          <p>Podemos atualizar esta política. Mudanças relevantes serão comunicadas pelos canais da conta.</p>
        </div>
      </section>

      <p className="mt-10 text-sm text-[#D6D3C4]">
        Veja também os <Link href="/termos" className="font-semibold text-[#F5A623]">Termos de Uso</Link>.
      </p>
    </main>
  );
}
