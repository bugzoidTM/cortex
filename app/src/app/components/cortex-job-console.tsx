"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

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
};

const initialForm = {
  title: "Como usar IA para conteúdo local",
  objective: "Gerar pacote semanal de conteúdo para validar o MVP",
  primaryPlatform: "LinkedIn",
  context:
    "Cliente quer explicar automação e IA de forma prática, humana e sem promessas exageradas.",
};

export function CortexJobConsole() {
  const [form, setForm] = useState(initialForm);
  const [payload, setPayload] = useState<JobsPayload | null>(null);
  const [status, setStatus] = useState("Carregando jobs reais...");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadJobs() {
    const response = await fetch("/api/jobs", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Falha ao carregar jobs: ${response.status}`);
    }
    const data = (await response.json()) as JobsPayload;
    setPayload(data);
    setStatus("Dados reais sincronizados com o banco.");
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadJobs().catch((error) => {
        setStatus(error instanceof Error ? error.message : "Erro ao carregar jobs.");
      });
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

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

  return (
    <div className="rounded-[2rem] border border-[#2487D8]/20 bg-[#071120] p-5 shadow-2xl shadow-black/30 lg:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-[#2487D8]">Console MVP real</p>
          <h3 className="mt-3 text-2xl font-black">Criar pacote real</h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#D6D3C4]">
            Este formulário já chama <code>/api/jobs</code>, grava briefing/job/artifact/ledger no PostgreSQL e atualiza a lista abaixo.
          </p>
        </div>
        <span className="rounded-full bg-[#F5A623]/15 px-4 py-2 text-sm font-semibold text-[#F5A623]">{status}</span>
      </div>

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

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Metric label="Jobs" value={payload?.metrics.jobs ?? 0} />
            <Metric label="Artifacts" value={payload?.metrics.artifacts ?? 0} />
            <Metric label="Tokens" value={(payload?.metrics.inputTokens ?? 0) + (payload?.metrics.outputTokens ?? 0)} />
            <Metric label="Custo USD" value={payload?.metrics.costUsd ?? "0"} />
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
