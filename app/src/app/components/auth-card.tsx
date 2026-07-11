"use client";

import { FormEvent, useEffect, useState } from "react";
import { friendlyApiError } from "./console-copy";

const initialRegister = { name: "", company: "", email: "", password: "" };

// Card de acesso na landing: entrar ou criar conta de teste. Em sucesso, leva ao /painel.
export function AuthCard() {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [login, setLogin] = useState({ email: "", password: "" });
  const [register, setRegister] = useState(initialRegister);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Se já houver sessão ativa, oferece ir direto ao painel.
  const [alreadyIn, setAlreadyIn] = useState(false);
  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => setAlreadyIn(r.ok))
      .catch(() => null);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>, kind: "login" | "register") {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const url = kind === "login" ? "/api/auth/login" : "/api/auth/register";
      const body = kind === "login" ? login : register;
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(friendlyApiError(payload, response.status, kind === "login" ? "Não foi possível entrar" : "Não foi possível criar a conta"));
      }
      window.location.href = "/painel";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Algo deu errado.");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[1.75rem] border border-[#2487D8]/25 bg-[#0C1A2E] p-6 shadow-2xl shadow-black/30">
      <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#7DC8F5]">Acesso</p>
      <h3 className="mt-2 text-2xl font-black">Entrar no Cortex</h3>

      {alreadyIn && (
        <a href="/painel" className="mt-4 block rounded-full bg-[#F5A623] px-5 py-3 text-center font-black text-[#071120]">
          Ir para o meu painel
        </a>
      )}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={() => setTab("login")}
          className={`rounded-full px-4 py-2 text-sm font-bold transition ${tab === "login" ? "bg-[#F5A623] text-[#071120]" : "border border-white/15 text-[#D6D3C4]"}`}
        >
          Já tenho conta
        </button>
        <button
          type="button"
          onClick={() => setTab("register")}
          className={`rounded-full px-4 py-2 text-sm font-bold transition ${tab === "register" ? "bg-[#F5A623] text-[#071120]" : "border border-white/15 text-[#D6D3C4]"}`}
        >
          Testar 14 dias grátis
        </button>
      </div>

      {tab === "login" ? (
        <form className="mt-5 space-y-3" onSubmit={(e) => submit(e, "login")}>
          <Field label="E-mail" type="email" value={login.email} onChange={(v) => setLogin({ ...login, email: v })} />
          <Field label="Senha" type="password" value={login.password} onChange={(v) => setLogin({ ...login, password: v })} minLength={8} />
          <button type="submit" disabled={busy} className="w-full rounded-full bg-[#F5A623] px-6 py-3 font-black text-[#071120] transition hover:scale-[1.01] disabled:opacity-60">
            {busy ? "Entrando..." : "Entrar"}
          </button>
        </form>
      ) : (
        <form className="mt-5 space-y-3" onSubmit={(e) => submit(e, "register")}>
          <p className="text-sm leading-6 text-[#D6D3C4]">
            Teste sem pagar nada por 14 dias, usando a sua própria chave de API. Sem cartão, sem Pix.
          </p>
          <Field label="Seu nome" value={register.name} onChange={(v) => setRegister({ ...register, name: v })} minLength={2} />
          <Field label="Empresa ou marca" value={register.company} onChange={(v) => setRegister({ ...register, company: v })} minLength={2} />
          <Field label="E-mail" type="email" value={register.email} onChange={(v) => setRegister({ ...register, email: v })} />
          <Field label="Senha (mínimo 12 caracteres)" type="password" value={register.password} onChange={(v) => setRegister({ ...register, password: v })} minLength={12} />
          <button type="submit" disabled={busy} className="w-full rounded-full bg-[#F5A623] px-6 py-3 font-black text-[#071120] transition hover:scale-[1.01] disabled:opacity-60">
            {busy ? "Criando..." : "Começar meu teste"}
          </button>
        </form>
      )}

      {message && <p aria-live="polite" className="mt-4 rounded-2xl bg-[#F5A623]/10 px-4 py-3 text-sm text-[#F9E6BC]">{message}</p>}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  minLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  minLength?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-[#ECEFF4]">{label}</span>
      <input
        className="w-full rounded-xl border border-white/10 bg-[#071120] px-4 py-3 text-[#ECEFF4] outline-none transition focus:border-[#F5A623]"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        minLength={minLength}
        required
      />
    </label>
  );
}
