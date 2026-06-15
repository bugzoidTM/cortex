"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Artifact = {
  id: string;
  title: string;
  content: string;
  type: string;
  format: string;
};

type SkillJob = {
  id: string;
  skill: string;
  status: string;
  createdAt: string;
  artifacts?: Artifact[];
  briefing?: {
    title: string;
    objective: string;
    primaryPlatform: string;
  } | null;
  usageLedger?: Array<{
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: string;
  }>;
};

type JobsPayload = {
  jobs: SkillJob[];
  metrics: {
    jobs: number;
    artifacts: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: string;
  };
  quotaStatus?: {
    plan: string;
    monthlyQuota: number;
    usedTokens: number;
    remainingTokens: number;
    usagePercent: number;
    estimatedJobTokens: number;
    maxJobInputTokens: number;
    canCreateJob: boolean;
    resetPeriod: string;
  };
};

type AuthState = {
  authenticated: boolean;
  email?: string;
  tenantId?: string;
};

type BrandProfileForm = {
  tone: string;
  audience: string;
  promise: string;
  restrictionsText: string;
  sampleContent: string;
};

const initialForm = {
  title: "Como usar IA para conteúdo local",
  objective: "Gerar pacote semanal de conteúdo para educar clientes e captar leads",
  primaryPlatform: "LinkedIn",
  context:
    "Cliente quer explicar automação e IA de forma prática, humana e sem promessas exageradas.",
};

const initialBrandProfile: BrandProfileForm = {
  tone: "",
  audience: "",
  promise: "",
  restrictionsText: "",
  sampleContent: "",
};

export function CortexJobConsole() {
  const [form, setForm] = useState(initialForm);
  const [brandProfile, setBrandProfile] = useState(initialBrandProfile);
  const [login, setLogin] = useState({ email: "", password: "" });
  const [auth, setAuth] = useState<AuthState>({ authenticated: false });
  const [payload, setPayload] = useState<JobsPayload | null>(null);
  const [status, setStatus] = useState("Verificando sessão segura...");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const loadJobs = useCallback(async () => {
    const response = await fetch("/api/jobs", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Falha ao carregar jobs: ${response.status}`);
    }
    const data = (await response.json()) as JobsPayload;
    setPayload(data);
    setStatus("Dados reais sincronizados com o banco.");
  }, []);

  const loadBrandProfile = useCallback(async () => {
    const response = await fetch("/api/brand-profile", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Falha ao carregar voz da marca: ${response.status}`);
    }
    const data = await response.json();
    const profile = data.profile;
    if (profile) {
      setBrandProfile({
        tone: profile.tone ?? "",
        audience: profile.audience ?? "",
        promise: profile.promise ?? "",
        restrictionsText: (profile.restrictions ?? []).join("\n"),
        sampleContent: profile.sampleContent ?? "",
      });
    }
  }, []);

  const loadSessionAndJobs = useCallback(async () => {
    const me = await fetch("/api/auth/me", { cache: "no-store" });

    if (me.status === 401) {
      setAuth({ authenticated: false });
      setPayload(null);
      setStatus("Faça login para acessar jobs reais do seu tenant.");
      return;
    }

    if (!me.ok) {
      throw new Error(`Falha ao verificar sessão: ${me.status}`);
    }

    const session = await me.json();
    setAuth({ authenticated: true, email: session.user.email, tenantId: session.tenantId });
    await Promise.all([loadBrandProfile(), loadJobs()]);
  }, [loadBrandProfile, loadJobs]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadSessionAndJobs().catch((error) => {
        setStatus(error instanceof Error ? error.message : "Erro ao carregar sessão.");
      });
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadSessionAndJobs]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoggingIn(true);
    setStatus("Autenticando sessão segura...");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(login),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.error ?? `Falha no login: ${response.status}`);
      }

      await loadSessionAndJobs();
      setStatus("Login concluído. Console conectado ao tenant real.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Erro ao fazer login.");
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuth({ authenticated: false });
    setPayload(null);
    setStatus("Sessão encerrada.");
  }

  async function handleBrandProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Salvando voz da marca...");

    try {
      const response = await fetch("/api/brand-profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tone: brandProfile.tone,
          audience: brandProfile.audience,
          promise: brandProfile.promise,
          restrictions: brandProfile.restrictionsText
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
          sampleContent: brandProfile.sampleContent,
        }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.error ?? `Falha ao salvar voz da marca: ${response.status}`);
      }

      await loadBrandProfile();
      setStatus("Voz da marca salva no tenant real.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Erro ao salvar voz da marca.");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus("Criando briefing, job, artifact e ledger...");

    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.error ?? `Falha ao criar job: ${response.status}`);
      }

      await loadJobs();
      setStatus("Pacote real criado e persistido com sucesso.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Erro ao criar pacote.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const latestJob = payload?.jobs[0];
  const latestArtifact = useMemo(() => latestJob?.artifacts?.[0], [latestJob]);
  const quotaStatus = payload?.quotaStatus;

  return (
    <div className="rounded-[2rem] border border-[#2487D8]/20 bg-[#071120] p-5 shadow-2xl shadow-black/30 lg:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-[#2487D8]">Console do cliente</p>
          <h3 className="mt-3 text-2xl font-black">Entrar no Cortex</h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#D6D3C4]">
            Acesse sua conta para editar a voz da marca, criar jobs de conteúdo e acompanhar histórico, quota e custo estimado do tenant.
          </p>
          {auth.authenticated && <p className="mt-2 text-sm text-[#7DC8F5]">Sessão: {auth.email} · tenant {auth.tenantId}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="rounded-full bg-[#F5A623]/15 px-4 py-2 text-sm font-semibold text-[#F5A623]">{status}</span>
          {auth.authenticated && (
            <button className="text-sm font-semibold text-[#D6D3C4] underline" onClick={handleLogout} type="button">
              Sair
            </button>
          )}
        </div>
      </div>

      {!auth.authenticated ? (
        <form className="grid gap-4 rounded-2xl border border-white/10 bg-[#0C1A2E] p-5 md:grid-cols-[1fr_1fr_auto] md:items-end" onSubmit={handleLogin}>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-[#ECEFF4]">E-mail</span>
            <input
              className="w-full rounded-2xl border border-white/10 bg-[#071120] px-4 py-3 text-[#ECEFF4] outline-none transition focus:border-[#F5A623]"
              type="email"
              value={login.email}
              onChange={(event) => setLogin({ ...login, email: event.target.value })}
              required
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-[#ECEFF4]">Senha</span>
            <input
              className="w-full rounded-2xl border border-white/10 bg-[#071120] px-4 py-3 text-[#ECEFF4] outline-none transition focus:border-[#F5A623]"
              type="password"
              value={login.password}
              onChange={(event) => setLogin({ ...login, password: event.target.value })}
              minLength={8}
              required
            />
          </label>
          <button
            className="rounded-full bg-[#F5A623] px-6 py-4 font-black text-[#071120] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={isLoggingIn}
          >
            {isLoggingIn ? "Entrando..." : "Entrar no Cortex"}
          </button>
        </form>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#ECEFF4]">Tema do pacote</span>
              <input
                className="w-full rounded-2xl border border-white/10 bg-[#0C1A2E] px-4 py-3 text-[#ECEFF4] outline-none transition focus:border-[#F5A623]"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                minLength={3}
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#ECEFF4]">Objetivo</span>
              <input
                className="w-full rounded-2xl border border-white/10 bg-[#0C1A2E] px-4 py-3 text-[#ECEFF4] outline-none transition focus:border-[#F5A623]"
                value={form.objective}
                onChange={(event) => setForm({ ...form, objective: event.target.value })}
                minLength={3}
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#ECEFF4]">Plataforma prioritária</span>
              <input
                className="w-full rounded-2xl border border-white/10 bg-[#0C1A2E] px-4 py-3 text-[#ECEFF4] outline-none transition focus:border-[#F5A623]"
                value={form.primaryPlatform}
                onChange={(event) => setForm({ ...form, primaryPlatform: event.target.value })}
                minLength={2}
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#ECEFF4]">Contexto estratégico</span>
              <textarea
                className="min-h-32 w-full rounded-2xl border border-white/10 bg-[#0C1A2E] px-4 py-3 text-[#ECEFF4] outline-none transition focus:border-[#F5A623]"
                value={form.context}
                onChange={(event) => setForm({ ...form, context: event.target.value })}
                minLength={3}
                required
              />
            </label>

            <button
              className="w-full rounded-full bg-[#F5A623] px-6 py-4 font-black text-[#071120] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Executando..." : "Executar pacote agora"}
            </button>
          </form>

          <form className="space-y-4 rounded-2xl border border-white/10 bg-[#0C1A2E] p-5" onSubmit={handleBrandProfileSubmit}>
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#2487D8]">Voz da marca</p>
              <h4 className="mt-2 text-xl font-black">Perfil usado no prompt real</h4>
            </div>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#ECEFF4]">Tom da marca</span>
              <input
                className="w-full rounded-2xl border border-white/10 bg-[#071120] px-4 py-3 text-[#ECEFF4] outline-none transition focus:border-[#F5A623]"
                value={brandProfile.tone}
                onChange={(event) => setBrandProfile({ ...brandProfile, tone: event.target.value })}
                minLength={3}
                required
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#ECEFF4]">Público</span>
              <input
                className="w-full rounded-2xl border border-white/10 bg-[#071120] px-4 py-3 text-[#ECEFF4] outline-none transition focus:border-[#F5A623]"
                value={brandProfile.audience}
                onChange={(event) => setBrandProfile({ ...brandProfile, audience: event.target.value })}
                minLength={3}
                required
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#ECEFF4]">Promessa</span>
              <input
                className="w-full rounded-2xl border border-white/10 bg-[#071120] px-4 py-3 text-[#ECEFF4] outline-none transition focus:border-[#F5A623]"
                value={brandProfile.promise}
                onChange={(event) => setBrandProfile({ ...brandProfile, promise: event.target.value })}
                minLength={3}
                required
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#ECEFF4]">Restrições</span>
              <textarea
                className="min-h-24 w-full rounded-2xl border border-white/10 bg-[#071120] px-4 py-3 text-[#ECEFF4] outline-none transition focus:border-[#F5A623]"
                value={brandProfile.restrictionsText}
                onChange={(event) => setBrandProfile({ ...brandProfile, restrictionsText: event.target.value })}
                placeholder="Uma restrição por linha"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#ECEFF4]">Exemplo aprovado</span>
              <textarea
                className="min-h-24 w-full rounded-2xl border border-white/10 bg-[#071120] px-4 py-3 text-[#ECEFF4] outline-none transition focus:border-[#F5A623]"
                value={brandProfile.sampleContent}
                onChange={(event) => setBrandProfile({ ...brandProfile, sampleContent: event.target.value })}
              />
            </label>
            <button className="w-full rounded-full border border-[#F5A623]/40 px-6 py-3 font-bold text-[#F5A623] transition hover:bg-[#F5A623] hover:text-[#071120]" type="submit">
              Salvar voz da marca
            </button>
          </form>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <Metric label="Jobs" value={payload?.metrics.jobs ?? 0} />
              <Metric label="Artifacts" value={payload?.metrics.artifacts ?? 0} />
              <Metric label="Tokens" value={(payload?.metrics.inputTokens ?? 0) + (payload?.metrics.outputTokens ?? 0)} />
              <Metric label="Custo USD" value={payload?.metrics.costUsd ?? "0"} />
            </div>

            <div className="rounded-2xl border border-[#2487D8]/20 bg-[#142A42] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7DC8F5]">Quota mensal</p>
                  <h4 className="mt-1 text-lg font-black">Plano {quotaStatus?.plan ?? "—"}</h4>
                </div>
                <span className="rounded-full bg-[#F5A623]/15 px-3 py-1 text-sm font-bold text-[#F5A623]">
                  {quotaStatus?.remainingTokens ?? 0} tokens restantes
                </span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#071120]">
                <div className="h-full rounded-full bg-[#F5A623]" style={{ width: `${quotaStatus?.usagePercent ?? 0}%` }} />
              </div>
              <p className="mt-2 text-sm text-[#D6D3C4]">
                {quotaStatus?.usedTokens ?? 0} de {quotaStatus?.monthlyQuota ?? 0} tokens usados neste mês · limite por execução: {quotaStatus?.maxJobInputTokens ?? 0} tokens de entrada.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0C1A2E] p-4">
              <h4 className="text-lg font-bold">Jobs recentes</h4>
              <div className="mt-4 space-y-3">
                {(payload?.jobs ?? []).slice(0, 4).map((job) => (
                  <div key={job.id} className="rounded-2xl border border-white/10 bg-[#142A42] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-bold">{job.briefing?.title ?? job.skill}</p>
                      <span className="rounded-full bg-[#2487D8]/15 px-3 py-1 text-xs font-bold text-[#7DC8F5]">{job.status}</span>
                    </div>
                    <p className="mt-2 text-sm text-[#D6D3C4]">{job.briefing?.objective}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[#7DC8F5]">
                      {job.usageLedger?.[0]?.provider ?? "provider pendente"} · {job.usageLedger?.[0]?.outputTokens ?? 0} tokens saída
                    </p>
                  </div>
                ))}
                {!payload?.jobs.length && <p className="text-sm text-[#D6D3C4]">Nenhum job criado ainda.</p>}
              </div>
            </div>

            <div className="rounded-2xl border border-[#F5A623]/20 bg-[#F5A623]/10 p-4">
              <h4 className="text-lg font-bold text-[#F5A623]">Artifact gerado</h4>
              <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-[#071120]/80 p-4 text-sm leading-6 text-[#F9E6BC]">
                {latestArtifact?.content ?? "Crie um pacote para visualizar o markdown persistido."}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-[#2487D8]/20 bg-[#142A42] p-4">
      <p className="text-2xl font-black text-[#F5A623]">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[#D6D3C4]">{label}</p>
    </div>
  );
}
