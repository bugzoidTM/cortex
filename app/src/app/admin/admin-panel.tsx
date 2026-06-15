"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type TenantOption = { id: string; slug: string; name: string };
type TenantRow = TenantOption & {
  plan: string;
  monthlyQuota: number;
  usedTokens: number;
  remainingTokens: number;
  costUsd: string;
  jobs: number;
  artifacts: number;
  members: number;
};
type ModelConfigRow = {
  id: string;
  tenantId: string | null;
  tenant: string;
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  inputCostPer1M: string;
  outputCostPer1M: string;
  maxOutputTokens: number;
  timeoutMs: number;
  enabled: boolean;
  isDefault: boolean;
};
type AdminPayload = {
  ok: boolean;
  superuser?: { email: string };
  summary: {
    tenantCount: number;
    userCount: number;
    jobCount: number;
    artifactCount: number;
    inputTokens: number;
    outputTokens: number;
    totalCostUsd: string;
    jobsByStatus: Array<{ status: string; count: number }>;
  };
  tenants: TenantRow[];
  modelConfigs: ModelConfigRow[];
  tenantOptions: TenantOption[];
  recentJobs: Array<{
    id: string;
    tenant: string;
    title: string;
    status: string;
    provider: string | null;
    model: string | null;
    tokens: number;
    costUsd: string;
  }>;
  readiness: Array<{ status: "done" | "partial" | "needed"; title: string; detail: string }>;
};

const initialTenant = { slug: "", name: "", plan: "beta", monthlyQuota: "1000000" };
const initialUser = { tenantId: "", email: "", name: "", password: "", role: "owner" };
const initialModelConfig = {
  id: "",
  tenantId: "",
  name: "CloseAI Qwen 3.7 Max",
  provider: "closeai",
  baseUrl: "https://closeai.nutef.com/v1",
  model: "qwen3.7-max",
  inputCostPer1M: "1.00",
  outputCostPer1M: "4.00",
  maxOutputTokens: "1800",
  timeoutMs: "180000",
  enabled: true,
  isDefault: true,
};

const readinessPresentation = {
  done: { label: "OK", className: "text-[#7DC8F5]" },
  partial: { label: "PARCIAL", className: "text-[#F5A623]" },
  needed: { label: "FALTA", className: "text-[#FF6B6B]" },
} as const;

export function AdminPanel() {
  const [data, setData] = useState<AdminPayload | null>(null);
  const [status, setStatus] = useState("Carregando painel administrativo...");
  const [tenantForm, setTenantForm] = useState(initialTenant);
  const [userForm, setUserForm] = useState(initialUser);
  const [modelForm, setModelForm] = useState(initialModelConfig);
  const [editingQuota, setEditingQuota] = useState<Record<string, string>>({});

  async function loadAdmin() {
    const response = await fetch("/api/admin", { cache: "no-store" });
    if (response.status === 401) throw new Error("Faça login antes de acessar o painel administrativo.");
    if (response.status === 403) throw new Error("superuser_required: seu usuário não está em CORTEX_SUPERUSER_EMAILS.");
    if (!response.ok) throw new Error(`Falha ao carregar admin: ${response.status}`);
    const payload = (await response.json()) as AdminPayload;
    const defaultModel = payload.modelConfigs.find((config) => config.isDefault) ?? payload.modelConfigs[0];

    setData(payload);
    setUserForm((current) => ({ ...current, tenantId: current.tenantId || payload.tenantOptions[0]?.id || "" }));
    if (defaultModel) {
      setModelForm({
        id: defaultModel.id,
        tenantId: defaultModel.tenantId ?? "",
        name: defaultModel.name,
        provider: defaultModel.provider,
        baseUrl: defaultModel.baseUrl,
        model: defaultModel.model,
        inputCostPer1M: defaultModel.inputCostPer1M,
        outputCostPer1M: defaultModel.outputCostPer1M,
        maxOutputTokens: String(defaultModel.maxOutputTokens),
        timeoutMs: String(defaultModel.timeoutMs),
        enabled: defaultModel.enabled,
        isDefault: defaultModel.isDefault,
      });
    }
    setStatus("Painel sincronizado com produção.");
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadAdmin().catch((error) => setStatus(error instanceof Error ? error.message : "Erro ao carregar admin."));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  async function runAction(action: string, payload: unknown) {
    setStatus(`Executando ${action}...`);
    const response = await fetch("/api/admin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => null);
      throw new Error(err?.error ?? `Falha em ${action}: ${response.status}`);
    }
    await loadAdmin();
  }

  async function handleCreateTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await runAction("create_tenant", { ...tenantForm, monthlyQuota: Number(tenantForm.monthlyQuota) });
      setTenantForm(initialTenant);
      setStatus("Tenant criado com perfil de marca padrão.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Erro ao criar tenant.");
    }
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await runAction("create_user", userForm);
      setUserForm({ ...initialUser, tenantId: userForm.tenantId });
      setStatus("Usuário criado/vinculado ao tenant.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Erro ao criar usuário.");
    }
  }

  async function handleModelConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await runAction("upsert_model_config", {
        ...modelForm,
        id: modelForm.id || undefined,
        tenantId: modelForm.tenantId || null,
        inputCostPer1M: Number(modelForm.inputCostPer1M),
        outputCostPer1M: Number(modelForm.outputCostPer1M),
        maxOutputTokens: Number(modelForm.maxOutputTokens),
        timeoutMs: Number(modelForm.timeoutMs),
      });
      setStatus("Configuração de modelo salva para o worker.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Erro ao salvar modelo.");
    }
  }

  async function updateTenantQuota(tenant: TenantRow) {
    try {
      await runAction("update_tenant", { tenantId: tenant.id, monthlyQuota: Number(editingQuota[tenant.id] ?? tenant.monthlyQuota) });
      setStatus("Quota mensal atualizada.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Erro ao atualizar quota.");
    }
  }

  const neededItems = useMemo(() => data?.readiness.filter((item) => item.status === "needed") ?? [], [data]);
  const partialItems = useMemo(() => data?.readiness.filter((item) => item.status === "partial") ?? [], [data]);

  if (!data) {
    return <div className="rounded-3xl border border-[#2487D8]/20 bg-[#0C1A2E] p-6 text-[#F5A623]">{status}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-[#2487D8]/20 bg-[#0C1A2E] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#7DC8F5]">Superusuário</p>
            <h2 className="mt-2 text-2xl font-black">{data.superuser?.email}</h2>
          </div>
          <span className="rounded-full bg-[#F5A623]/15 px-4 py-2 text-sm font-bold text-[#F5A623]">{status}</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Tenants" value={data.summary.tenantCount} />
        <Metric label="Usuários" value={data.summary.userCount} />
        <Metric label="Jobs" value={data.summary.jobCount} />
        <Metric label="Custo USD" value={data.summary.totalCostUsd} />
      </div>

      <section className="grid gap-6 xl:grid-cols-2">
        <form className="space-y-4 rounded-3xl border border-white/10 bg-[#0C1A2E] p-5" onSubmit={handleCreateTenant}>
          <h3 className="text-xl font-black">Criar tenant</h3>
          <Input label="Slug" value={tenantForm.slug} onChange={(value) => setTenantForm({ ...tenantForm, slug: value })} placeholder="cliente-beta" required />
          <Input label="Nome" value={tenantForm.name} onChange={(value) => setTenantForm({ ...tenantForm, name: value })} placeholder="Cliente Beta" required />
          <Input label="Plano" value={tenantForm.plan} onChange={(value) => setTenantForm({ ...tenantForm, plan: value })} required />
          <Input label="Quota mensal" value={tenantForm.monthlyQuota} onChange={(value) => setTenantForm({ ...tenantForm, monthlyQuota: value })} type="number" required />
          <button className="rounded-full bg-[#F5A623] px-5 py-3 font-black text-[#071120]" type="submit">Criar tenant</button>
        </form>

        <form className="space-y-4 rounded-3xl border border-white/10 bg-[#0C1A2E] p-5" onSubmit={handleCreateUser}>
          <h3 className="text-xl font-black">Criar usuário</h3>
          <label className="block text-sm font-bold text-[#D6D3C4]">
            Tenant
            <select className="mt-2 w-full rounded-2xl border border-white/10 bg-[#071120] px-4 py-3 text-[#ECEFF4]" value={userForm.tenantId} onChange={(event) => setUserForm({ ...userForm, tenantId: event.target.value })} required>
              {data.tenantOptions.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name} ({tenant.slug})</option>)}
            </select>
          </label>
          <Input label="E-mail" value={userForm.email} onChange={(value) => setUserForm({ ...userForm, email: value })} type="email" required />
          <Input label="Nome" value={userForm.name} onChange={(value) => setUserForm({ ...userForm, name: value })} />
          <Input label="Senha inicial" value={userForm.password} onChange={(value) => setUserForm({ ...userForm, password: value })} type="password" required />
          <Input label="Papel" value={userForm.role} onChange={(value) => setUserForm({ ...userForm, role: value })} required />
          <button className="rounded-full bg-[#F5A623] px-5 py-3 font-black text-[#071120]" type="submit">Criar usuário</button>
        </form>
      </section>

      <section className="rounded-3xl border border-[#2487D8]/20 bg-[#0C1A2E] p-5">
        <h3 className="text-xl font-black">Modelo padrão</h3>
        <p className="mt-2 text-sm text-[#D6D3C4]">Configuração usada pelo worker para novas gerações. A chave de API continua em Docker secret; modelo, endpoint, timeout e preço ficam no banco.</p>
        <form className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={handleModelConfig}>
          <Input label="Nome" value={modelForm.name} onChange={(value) => setModelForm({ ...modelForm, name: value })} required />
          <Input label="Provider" value={modelForm.provider} onChange={(value) => setModelForm({ ...modelForm, provider: value })} required />
          <Input label="Base URL" value={modelForm.baseUrl} onChange={(value) => setModelForm({ ...modelForm, baseUrl: value })} required />
          <Input label="Modelo" value={modelForm.model} onChange={(value) => setModelForm({ ...modelForm, model: value })} required />
          <Input label="Custo entrada / 1M" value={modelForm.inputCostPer1M} onChange={(value) => setModelForm({ ...modelForm, inputCostPer1M: value })} type="number" required />
          <Input label="Custo saída / 1M" value={modelForm.outputCostPer1M} onChange={(value) => setModelForm({ ...modelForm, outputCostPer1M: value })} type="number" required />
          <Input label="Max output tokens" value={modelForm.maxOutputTokens} onChange={(value) => setModelForm({ ...modelForm, maxOutputTokens: value })} type="number" required />
          <Input label="Timeout ms" value={modelForm.timeoutMs} onChange={(value) => setModelForm({ ...modelForm, timeoutMs: value })} type="number" required />
          <label className="block text-sm font-bold text-[#D6D3C4]">
            Escopo
            <select className="mt-2 w-full rounded-2xl border border-white/10 bg-[#071120] px-4 py-3 text-[#ECEFF4]" value={modelForm.tenantId} onChange={(event) => setModelForm({ ...modelForm, tenantId: event.target.value })}>
              <option value="">Global</option>
              {data.tenantOptions.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name} ({tenant.slug})</option>)}
            </select>
          </label>
          <label className="mt-8 flex items-center gap-2 text-sm font-bold text-[#D6D3C4]"><input checked={modelForm.enabled} onChange={(event) => setModelForm({ ...modelForm, enabled: event.target.checked })} type="checkbox" /> Habilitado</label>
          <label className="mt-8 flex items-center gap-2 text-sm font-bold text-[#D6D3C4]"><input checked={modelForm.isDefault} onChange={(event) => setModelForm({ ...modelForm, isDefault: event.target.checked })} type="checkbox" /> Padrão</label>
          <button className="mt-6 rounded-full bg-[#F5A623] px-5 py-3 font-black text-[#071120]" type="submit">Salvar modelo</button>
        </form>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {data.modelConfigs.map((config) => (
            <button className="rounded-2xl border border-white/10 bg-[#071120] p-4 text-left" key={config.id} type="button" onClick={() => setModelForm({ id: config.id, tenantId: config.tenantId ?? "", name: config.name, provider: config.provider, baseUrl: config.baseUrl, model: config.model, inputCostPer1M: config.inputCostPer1M, outputCostPer1M: config.outputCostPer1M, maxOutputTokens: String(config.maxOutputTokens), timeoutMs: String(config.timeoutMs), enabled: config.enabled, isDefault: config.isDefault })}>
              <div className="flex justify-between gap-3"><b>{config.name}</b><span className="text-[#F5A623]">{config.isDefault ? "padrão" : config.enabled ? "ativo" : "inativo"}</span></div>
              <p className="mt-1 text-sm text-[#D6D3C4]">{config.tenant} · {config.provider} · {config.model} · ${config.inputCostPer1M}/${config.outputCostPer1M} por 1M · {config.timeoutMs} ms</p>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-[#0C1A2E] p-5">
        <h3 className="text-xl font-black">Tenants e quota mensal</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="text-[#7DC8F5]"><tr><th>Tenant</th><th>Plano</th><th>Quota mensal</th><th>Uso</th><th>Restante</th><th>Jobs</th><th>Custo</th><th>Ação</th></tr></thead>
            <tbody>
              {data.tenants.map((tenant) => (
                <tr key={tenant.id} className="border-t border-white/10">
                  <td className="py-3"><b>{tenant.name}</b><br /><span className="text-[#D6D3C4]">{tenant.slug}</span></td>
                  <td>{tenant.plan}</td>
                  <td><input className="w-32 rounded-xl bg-[#071120] px-3 py-2" type="number" value={editingQuota[tenant.id] ?? tenant.monthlyQuota} onChange={(event) => setEditingQuota({ ...editingQuota, [tenant.id]: event.target.value })} /></td>
                  <td>{tenant.usedTokens}</td>
                  <td>{tenant.remainingTokens}</td>
                  <td>{tenant.jobs}</td>
                  <td>{tenant.costUsd}</td>
                  <td><button className="rounded-full border border-[#F5A623]/40 px-3 py-2 text-[#F5A623]" type="button" onClick={() => updateTenantQuota(tenant)}>Salvar quota</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <div className="rounded-3xl border border-white/10 bg-[#0C1A2E] p-5">
          <h3 className="text-xl font-black">Jobs recentes</h3>
          <div className="mt-4 space-y-3">
            {data.recentJobs.map((job) => (
              <div className="rounded-2xl bg-[#142A42] p-4" key={job.id}>
                <div className="flex justify-between gap-3"><b>{job.title}</b><span className="text-[#F5A623]">{job.status}</span></div>
                <p className="mt-1 text-sm text-[#D6D3C4]">{job.tenant} · {job.provider ?? "sem provider"} · {job.model ?? "sem modelo"} · {job.tokens} tokens · ${job.costUsd}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-[#F5A623]/20 bg-[#0C1A2E] p-5">
          <h3 className="text-xl font-black">Modo de produção: lacunas e endurecimentos</h3>
          <p className="mt-2 text-sm text-[#D6D3C4]">
            {neededItems.length} itens ainda bloqueiam beta aberto com usuários reais. {partialItems.length} itens já têm cobertura inicial e pedem endurecimento antes de escalar.
          </p>
          <div className="mt-4 space-y-3">
            {data.readiness.map((item) => {
              const presentation = readinessPresentation[item.status];
              return (
                <div className="rounded-2xl border border-white/10 bg-[#071120] p-4" key={item.title}>
                  <span className={presentation.className}>{presentation.label}</span>
                  <h4 className="mt-1 font-black">{item.title}</h4>
                  <p className="mt-1 text-sm text-[#D6D3C4]">{item.detail}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-3xl border border-[#2487D8]/20 bg-[#142A42] p-5"><p className="text-2xl font-black text-[#F5A623]">{value}</p><p className="mt-1 text-xs uppercase tracking-[0.18em] text-[#D6D3C4]">{label}</p></div>;
}

function Input({ label, value, onChange, type = "text", required = false, placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; placeholder?: string }) {
  return <label className="block text-sm font-bold text-[#D6D3C4]">{label}<input className="mt-2 w-full rounded-2xl border border-white/10 bg-[#071120] px-4 py-3 text-[#ECEFF4]" type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} placeholder={placeholder} step="any" /></label>;
}
