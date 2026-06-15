"use client";

import { FormEvent, useState } from "react";

const plans = [
  { id: "starter", name: "Plano Starter", price: "R$ 97/mês", quota: "300 mil tokens/mês" },
  { id: "pro", name: "Plano Pro", price: "R$ 197/mês", quota: "1 milhão de tokens/mês" },
] as const;

export function SelfServiceCheckout() {
  const [form, setForm] = useState({ plan: "starter", name: "", company: "", email: "", password: "", phone: "", taxID: "" });
  const [status, setStatus] = useState("Escolha um plano, crie a conta e pague com Pix para liberar o Cortex.");
  const [paymentLinkUrl, setPaymentLinkUrl] = useState<string | null>(null);
  const [brCode, setBrCode] = useState<string | null>(null);

  async function handleCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Criando checkout Woovi...");
    setPaymentLinkUrl(null);
    setBrCode(null);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? `Falha no checkout: ${response.status}`);
      }
      setPaymentLinkUrl(payload.checkout.paymentLinkUrl);
      setBrCode(payload.checkout.brCode);
      setStatus("Checkout criado. Pague com Pix; a liberação ocorre automaticamente quando a Woovi confirmar OPENPIX:CHARGE_COMPLETED.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Erro ao criar checkout.");
    }
  }

  return (
    <div className="rounded-[2rem] border border-[#F5A623]/30 bg-[#0C1A2E] p-6">
      <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#F5A623]">Venda self-service</p>
      <h3 className="mt-3 text-2xl font-black">Criar conta e pagar com Pix</h3>
      <p className="mt-2 text-sm leading-6 text-[#D6D3C4]">Assinatura mensal com checkout Woovi, liberação automática por webhook e bloqueio por inadimplência.</p>

      <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={handleCheckout}>
        <label className="md:col-span-2 block text-sm font-bold text-[#D6D3C4]">
          Plano
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {plans.map((plan) => (
              <button key={plan.id} className={`rounded-2xl border p-4 text-left ${form.plan === plan.id ? "border-[#F5A623] bg-[#F5A623]/10" : "border-white/10 bg-[#071120]"}`} type="button" onClick={() => setForm({ ...form, plan: plan.id })}>
                <b>{plan.name}</b>
                <p className="mt-1 text-[#F5A623]">{plan.price}</p>
                <p className="mt-1 text-xs text-[#D6D3C4]">{plan.quota}</p>
              </button>
            ))}
          </div>
        </label>
        <Input label="Seu nome" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
        <Input label="Empresa/marca" value={form.company} onChange={(value) => setForm({ ...form, company: value })} required />
        <Input label="E-mail" value={form.email} onChange={(value) => setForm({ ...form, email: value })} type="email" required />
        <Input label="Senha inicial" value={form.password} onChange={(value) => setForm({ ...form, password: value })} type="password" required />
        <Input label="Telefone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
        <Input label="CPF/CNPJ" value={form.taxID} onChange={(value) => setForm({ ...form, taxID: value })} />
        <button className="md:col-span-2 rounded-full bg-[#F5A623] px-6 py-4 font-black text-[#071120]" type="submit">Criar conta e pagar com Pix</button>
      </form>

      <div className="mt-4 rounded-2xl bg-[#071120] p-4 text-sm text-[#D6D3C4]">
        {status}
        {paymentLinkUrl && <p className="mt-3"><a className="font-bold text-[#F5A623] underline" href={paymentLinkUrl} target="_blank" rel="noreferrer">Abrir link de pagamento Woovi</a></p>}
        {brCode && <textarea className="mt-3 min-h-24 w-full rounded-xl bg-[#0C1A2E] p-3 text-xs" readOnly value={brCode} />}
      </div>

      <p className="mt-4 text-sm text-[#D6D3C4]">Esqueci minha senha: informe seu e-mail no login e solicite reset; o link transacional é enviado quando SMTP estiver configurado.</p>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <label className="block text-sm font-bold text-[#D6D3C4]">{label}<input className="mt-2 w-full rounded-2xl border border-white/10 bg-[#071120] px-4 py-3 text-[#ECEFF4]" value={value} onChange={(event) => onChange(event.target.value)} type={type} required={required} minLength={type === "password" ? 12 : undefined} /></label>;
}
