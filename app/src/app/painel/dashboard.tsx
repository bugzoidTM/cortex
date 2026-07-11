"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  API_ERROR_MESSAGES,
  extractLinkedInSection,
  friendlyApiError,
  friendlyGenerationError,
  GENERATION_STATUS_LABELS,
  PUBLICATION_STATUS_LABELS,
  publicationError,
  SOCIAL_QUERY_MESSAGES,
  SUBSCRIPTION_STATUS_LABELS,
} from "../components/console-copy";

type Artifact = { id: string; title: string; content: string };
type Generation = {
  id: string;
  status: string;
  createdAt: string;
  error?: string | null;
  output?: { status?: string } | null;
  artifacts?: Artifact[];
  briefing?: { title: string; objective: string } | null;
  usageLedger?: Array<{ provider: string; outputTokens: number }>;
};
type JobsPayload = {
  jobs: Generation[];
  metrics: { jobs: number; artifacts: number; inputTokens: number; outputTokens: number; costUsd: string };
  quotaStatus?: {
    plan: string;
    monthlyQuota: number;
    usedTokens: number;
    remainingTokens: number;
    usagePercent: number;
    maxJobInputTokens: number;
  };
};
type BillingState = {
  plan: string;
  trial: { trialEndsAt: string } | null;
  subscription: {
    plan: string;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    pendingInvoice: { paymentLinkUrl: string | null } | null;
  } | null;
};
type SocialState = {
  configured: boolean;
  connection: { connected: boolean; displayName: string | null; status: string | null; tokenExpiresAt: string | null; expiringSoon: boolean };
};
type PublicationRow = { id: string; commentary: string; status: string; externalUrl: string | null; error: string | null; createdAt: string };
type LlmCredentialStatus = { configured: boolean; model: string | null; apiKeyPreview: string | null; trialActive: boolean; trialEndsAt: string | null };

type Section = "criar" | "publicar" | "marca" | "conta";

const initialBriefing = {
  title: "Como usar IA para conteúdo local",
  objective: "Educar clientes e captar leads com conteúdo semanal",
  primaryPlatform: "LinkedIn",
  context: "Explicar automação e IA de forma prática, humana e sem promessas exageradas.",
};
const initialBrand = { tone: "", audience: "", promise: "", restrictionsText: "", sampleContent: "" };
const initialCredential = { provider: "openai-compatible", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", apiKey: "" };

export function Dashboard() {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<{ email: string; name: string | null } | null>(null);
  const [section, setSection] = useState<Section>("criar");

  const [briefing, setBriefing] = useState(initialBriefing);
  const [brand, setBrand] = useState(initialBrand);
  const [credentialForm, setCredentialForm] = useState(initialCredential);
  const [credential, setCredential] = useState<LlmCredentialStatus | null>(null);
  const [payload, setPayload] = useState<JobsPayload | null>(null);
  const [billing, setBilling] = useState<BillingState | null>(null);
  const [social, setSocial] = useState<SocialState | null>(null);
  const [publications, setPublications] = useState<PublicationRow[]>([]);

  const [status, setStatus] = useState<string | null>(null);
  const [actionLink, setActionLink] = useState<{ href: string; label: string } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [savingBrand, setSavingBrand] = useState(false);
  const [busyBilling, setBusyBilling] = useState(false);

  const [publishOpen, setPublishOpen] = useState(false);
  const [publishText, setPublishText] = useState("");
  const [publishArtifactId, setPublishArtifactId] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  const [deletePassword, setDeletePassword] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const wasGeneratingRef = useRef(false);

  const loadJobs = useCallback(async (silent?: boolean) => {
    const r = await fetch("/api/jobs", { cache: "no-store" });
    if (!r.ok) return;
    const data = (await r.json()) as JobsPayload;
    setPayload(data);
    const active = data.jobs.some((j) => j.status === "PENDING" || j.status === "PROCESSING");
    if (silent && wasGeneratingRef.current && !active && data.jobs[0]) {
      const latest = data.jobs[0];
      if (latest.status === "COMPLETED") {
        setStatus(latest.output?.status === "fallback" ? "Pacote entregue em modo de contingência (IA indisponível) — sem consumo do seu limite." : "Pacote pronto — veja ao lado.");
      } else if (latest.status === "FAILED") {
        setStatus(`A geração falhou: ${friendlyGenerationError(latest.error)}. Você pode tentar de novo.`);
      }
    }
    wasGeneratingRef.current = active;
  }, []);

  const loadBilling = useCallback(async () => {
    const r = await fetch("/api/billing", { cache: "no-store" });
    if (!r.ok) return;
    const d = await r.json();
    setBilling({ plan: d.plan, trial: d.trial, subscription: d.subscription });
  }, []);
  const loadSocial = useCallback(async () => {
    const r = await fetch("/api/social", { cache: "no-store" });
    if (!r.ok) return;
    const d = await r.json();
    setSocial({ configured: d.configured, connection: d.connection });
  }, []);
  const loadPublications = useCallback(async () => {
    const r = await fetch("/api/publications", { cache: "no-store" });
    if (!r.ok) return;
    const d = await r.json();
    setPublications(d.publications ?? []);
  }, []);
  const loadBrand = useCallback(async () => {
    const r = await fetch("/api/brand-profile", { cache: "no-store" });
    if (!r.ok) return;
    const p = (await r.json()).profile;
    if (p) setBrand({ tone: p.tone ?? "", audience: p.audience ?? "", promise: p.promise ?? "", restrictionsText: (p.restrictions ?? []).join("\n"), sampleContent: p.sampleContent ?? "" });
  }, []);
  const loadCredential = useCallback(async () => {
    const r = await fetch("/api/llm-credential", { cache: "no-store" });
    if (!r.ok) return;
    setCredential((await r.json()).credential as LlmCredentialStatus);
  }, []);

  // Auth gate + carga inicial. Sem sessão, volta para a landing.
  useEffect(() => {
    let alive = true;
    (async () => {
      const meRes = await fetch("/api/auth/me", { cache: "no-store" }).catch(() => null);
      if (!meRes || meRes.status === 401) {
        window.location.href = "/#acesso";
        return;
      }
      const session = await meRes.json();
      if (!alive) return;
      setMe({ email: session.user.email, name: session.user.name });
      await Promise.all([loadBrand(), loadCredential(), loadJobs(), loadBilling(), loadSocial(), loadPublications()]);
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [loadBrand, loadCredential, loadJobs, loadBilling, loadSocial, loadPublications]);

  // Mensagem de volta do OAuth do LinkedIn (?social=…): mostra e leva para a aba Publicar.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const param = new URLSearchParams(window.location.search).get("social");
    if (!param || !SOCIAL_QUERY_MESSAGES[param]) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("social");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    const t = window.setTimeout(() => {
      setStatus(SOCIAL_QUERY_MESSAGES[param]);
      setSection("publicar");
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  const hasActiveJob = useMemo(() => (payload?.jobs ?? []).some((j) => j.status === "PENDING" || j.status === "PROCESSING"), [payload]);
  useEffect(() => {
    if (!ready || !hasActiveJob) return;
    const t = window.setTimeout(() => loadJobs(true).catch(() => null), 5000);
    return () => window.clearTimeout(t);
  }, [ready, hasActiveJob, payload, loadJobs]);

  const hasPendingPub = useMemo(() => publications.some((p) => p.status === "PENDING" || p.status === "PUBLISHING"), [publications]);
  useEffect(() => {
    if (!ready || !hasPendingPub) return;
    const t = window.setTimeout(() => loadPublications().catch(() => null), 5000);
    return () => window.clearTimeout(t);
  }, [ready, hasPendingPub, publications, loadPublications]);

  const latestJob = payload?.jobs[0];
  const latestArtifact = latestJob?.artifacts?.[0];
  const quota = payload?.quotaStatus;
  const subscription = billing?.subscription;
  const subscriptionBlocked = subscription && ["PENDING", "PAST_DUE", "INCOMPLETE"].includes(subscription.status);
  const linkedinConnected = social?.connection.connected ?? false;
  const needsKeyForTrial = Boolean(billing?.trial) && !credential?.configured;

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsGenerating(true);
    setActionLink(null);
    setStatus("Enviando briefing para gerar...");
    try {
      const r = await fetch("/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(briefing) });
      if (!r.ok) {
        const p = await r.json().catch(() => null);
        if (p?.paymentLinkUrl) setActionLink({ href: p.paymentLinkUrl, label: "Pagar com Pix para regularizar" });
        if (p?.error === "trial_requires_byok") setSection("conta");
        throw new Error(friendlyApiError(p, r.status, "Não foi possível gerar"));
      }
      await loadJobs(true);
      setStatus("Gerando com IA — o pacote aparece ao lado em instantes.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Erro ao gerar.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function saveBrand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingBrand(true);
    setStatus("Salvando voz da marca...");
    try {
      const r = await fetch("/api/brand-profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tone: brand.tone, audience: brand.audience, promise: brand.promise, restrictions: brand.restrictionsText.split("\n").map((s) => s.trim()).filter(Boolean), sampleContent: brand.sampleContent }),
      });
      if (!r.ok) {
        const p = await r.json().catch(() => null);
        throw new Error(friendlyApiError(p, r.status, "Não foi possível salvar"));
      }
      await loadBrand();
      setStatus("Voz da marca salva. As próximas gerações já usam este perfil.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSavingBrand(false);
    }
  }

  async function saveCredential(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Salvando sua chave de API...");
    try {
      const r = await fetch("/api/llm-credential", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(credentialForm) });
      if (!r.ok) {
        const p = await r.json().catch(() => null);
        throw new Error(friendlyApiError(p, r.status, "Não foi possível salvar a chave"));
      }
      await loadCredential();
      setCredentialForm((c) => ({ ...c, apiKey: "" }));
      setStatus("Chave salva. Já dá para gerar seu primeiro pacote.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Erro ao salvar a chave.");
    }
  }

  async function removeCredential() {
    const r = await fetch("/api/llm-credential", { method: "DELETE" });
    if (r.ok) {
      await loadCredential();
      setStatus("Chave removida.");
    }
  }

  async function billingAction(action: "cancel" | "resume" | "regenerate_invoice") {
    setBusyBilling(true);
    setStatus({ cancel: "Agendando cancelamento...", resume: "Reativando...", regenerate_invoice: "Gerando nova cobrança..." }[action]);
    try {
      const r = await fetch("/api/billing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(friendlyApiError(d, r.status, "Não foi possível concluir"));
      await loadBilling();
      if (action === "regenerate_invoice" && d?.paymentLinkUrl) {
        setActionLink({ href: d.paymentLinkUrl, label: "Abrir cobrança Pix" });
        setStatus("Nova cobrança Pix gerada.");
      } else {
        setStatus(action === "cancel" ? "Cancelamento agendado para o fim do período pago." : "Assinatura reativada.");
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Erro na ação.");
    } finally {
      setBusyBilling(false);
    }
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsDeleting(true);
    setStatus("Excluindo conta e dados...");
    try {
      const r = await fetch("/api/auth/delete-account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: deletePassword }) });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(friendlyApiError(d, r.status, "Não foi possível excluir"));
      window.location.href = "/";
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Erro ao excluir.");
      setIsDeleting(false);
    }
  }

  function connectLinkedIn() {
    window.location.href = "/api/social/linkedin/connect";
  }
  async function disconnectLinkedIn() {
    const r = await fetch("/api/social", { method: "DELETE" });
    if (r.ok) {
      await loadSocial();
      setStatus("LinkedIn desconectado.");
    }
  }
  function openPublish() {
    setPublishText(extractLinkedInSection(latestArtifact?.content ?? ""));
    setPublishArtifactId(latestArtifact?.id ?? null);
    setPublishOpen(true);
    setStatus(null);
  }
  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPublishing(true);
    setStatus("Enviando para o LinkedIn...");
    try {
      const r = await fetch("/api/publications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ commentary: publishText, artifactId: publishArtifactId ?? undefined }) });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(API_ERROR_MESSAGES[d?.error as string] ?? friendlyApiError(d, r.status, "Não foi possível publicar"));
      setPublishOpen(false);
      await loadPublications();
      setStatus("Post na fila do LinkedIn — publica em instantes. Acompanhe em Publicar.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Erro ao publicar.");
    } finally {
      setIsPublishing(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  if (!ready) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#071120] text-[#D6D3C4]">
        <div className="flex items-center gap-3 text-sm">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#F5A623] border-t-transparent" />
          Carregando seu painel...
        </div>
      </main>
    );
  }

  const NAV: Array<{ key: Section; label: string; hint: string }> = [
    { key: "criar", label: "Criar conteúdo", hint: "Briefing → pacote" },
    { key: "publicar", label: "Publicar", hint: "LinkedIn" },
    { key: "marca", label: "Voz da marca", hint: "Tom e regras" },
    { key: "conta", label: "Conta", hint: "Plano e limite" },
  ];
  const sectionTitle = NAV.find((n) => n.key === section)?.label ?? "";

  return (
    <div className="min-h-screen bg-[#071120] text-[#ECEFF4] lg:flex">
      {/* Sidebar */}
      <aside className="border-b border-white/10 bg-[#0C1A2E] lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="grid size-9 place-items-center rounded-xl border border-[#2487D8]/40 bg-[#142A42]">
            <span className="text-lg font-black text-[#F5A623]">C</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-none">Cortex</p>
            <p className="truncate text-xs text-[#8FA3B8]">{me?.name || me?.email}</p>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
          {NAV.map((item) => {
            const on = section === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setSection(item.key)}
                aria-current={on ? "page" : undefined}
                className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition lg:w-full ${
                  on ? "bg-[#F5A623]/12 text-[#F5A623]" : "text-[#D6D3C4] hover:bg-white/5"
                }`}
              >
                <span className={`hidden h-5 w-1 rounded-full lg:block ${on ? "bg-[#F5A623]" : "bg-transparent"}`} />
                <span className="flex flex-col">
                  {item.label}
                  <span className="text-[11px] font-normal text-[#8FA3B8]">{item.hint}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto hidden border-t border-white/10 px-5 py-4 lg:block">
          {quota && (
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs text-[#8FA3B8]">
                <span>Plano {quota.plan}</span>
                <span>{quota.usagePercent}% usado</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#071120]">
                <div className="h-full rounded-full bg-[#F5A623]" style={{ width: `${quota.usagePercent}%` }} />
              </div>
            </div>
          )}
          <button type="button" onClick={logout} className="text-sm font-semibold text-[#D6D3C4] hover:text-[#F5A623]">
            Sair
          </button>
        </div>
      </aside>

      {/* Conteúdo */}
      <main className="flex-1">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4 lg:px-8">
          <h1 className="text-xl font-black">{sectionTitle}</h1>
          <div className="flex items-center gap-3">
            {status && <span aria-live="polite" className="rounded-full bg-[#F5A623]/15 px-4 py-1.5 text-sm font-semibold text-[#F5A623]">{status}</span>}
            {actionLink && (
              <a className="rounded-full bg-[#F5A623] px-4 py-1.5 text-sm font-black text-[#071120]" href={actionLink.href} target="_blank" rel="noreferrer">
                {actionLink.label}
              </a>
            )}
            <button type="button" onClick={logout} className="text-sm font-semibold text-[#D6D3C4] underline lg:hidden">
              Sair
            </button>
          </div>
        </header>

        <div className="px-5 py-6 lg:px-8 lg:py-8">
          {section === "criar" && (
            <CriarSection
              briefing={briefing}
              setBriefing={setBriefing}
              generate={generate}
              isGenerating={isGenerating}
              hasActiveJob={hasActiveJob}
              needsKeyForTrial={needsKeyForTrial}
              goToConta={() => setSection("conta")}
              latestJob={latestJob}
              latestArtifact={latestArtifact}
              jobs={payload?.jobs ?? []}
              linkedinConnected={linkedinConnected}
              socialConfigured={social?.configured ?? false}
              publishOpen={publishOpen}
              openPublish={openPublish}
              closePublish={() => setPublishOpen(false)}
              publishText={publishText}
              setPublishText={setPublishText}
              publish={publish}
              isPublishing={isPublishing}
              connectLinkedIn={connectLinkedIn}
              displayName={social?.connection.displayName ?? null}
            />
          )}

          {section === "publicar" && (
            <PublicarSection
              social={social}
              linkedinConnected={linkedinConnected}
              connectLinkedIn={connectLinkedIn}
              disconnectLinkedIn={disconnectLinkedIn}
              publications={publications}
              hasPendingPub={hasPendingPub}
              hasArtifact={Boolean(latestArtifact)}
              openPublish={() => {
                setSection("criar");
                openPublish();
              }}
            />
          )}

          {section === "marca" && <MarcaSection brand={brand} setBrand={setBrand} save={saveBrand} saving={savingBrand} />}

          {section === "conta" && (
            <ContaSection
              email={me?.email ?? ""}
              billing={billing}
              subscription={subscription ?? null}
              subscriptionBlocked={Boolean(subscriptionBlocked)}
              busyBilling={busyBilling}
              billingAction={billingAction}
              quota={quota}
              metrics={payload?.metrics}
              credential={credential}
              credentialForm={credentialForm}
              setCredentialForm={setCredentialForm}
              saveCredential={saveCredential}
              removeCredential={removeCredential}
              showDelete={showDelete}
              setShowDelete={setShowDelete}
              deletePassword={deletePassword}
              setDeletePassword={setDeletePassword}
              deleteAccount={deleteAccount}
              isDeleting={isDeleting}
            />
          )}
        </div>
      </main>
    </div>
  );
}

/* ---------- Seção: Criar ---------- */

type Briefing = typeof initialBriefing;
function CriarSection(props: {
  briefing: Briefing;
  setBriefing: (b: Briefing) => void;
  generate: (e: FormEvent<HTMLFormElement>) => void;
  isGenerating: boolean;
  hasActiveJob: boolean;
  needsKeyForTrial: boolean;
  goToConta: () => void;
  latestJob?: Generation;
  latestArtifact?: Artifact;
  jobs: Generation[];
  linkedinConnected: boolean;
  socialConfigured: boolean;
  publishOpen: boolean;
  openPublish: () => void;
  closePublish: () => void;
  publishText: string;
  setPublishText: (v: string) => void;
  publish: (e: FormEvent<HTMLFormElement>) => void;
  isPublishing: boolean;
  connectLinkedIn: () => void;
  displayName: string | null;
}) {
  const { briefing, setBriefing, latestArtifact, latestJob } = props;
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      {/* Briefing */}
      <section>
        {props.needsKeyForTrial && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#F5A623]/30 bg-[#F5A623]/10 p-4 text-sm text-[#F9E6BC]">
            <span>No teste, cadastre sua chave de API para gerar conteúdo.</span>
            <button type="button" onClick={props.goToConta} className="rounded-full bg-[#F5A623] px-4 py-1.5 text-sm font-black text-[#071120]">
              Cadastrar chave
            </button>
          </div>
        )}
        <Card>
          <CardEyebrow>Briefing</CardEyebrow>
          <p className="mt-1 text-sm text-[#8FA3B8]">Descreva o que você quer. O Cortex usa a voz da sua marca para gerar o pacote.</p>
          <form className="mt-5 space-y-4" onSubmit={props.generate}>
            <Field label="Tema" value={briefing.title} onChange={(v) => setBriefing({ ...briefing, title: v })} minLength={3} />
            <Field label="Objetivo" value={briefing.objective} onChange={(v) => setBriefing({ ...briefing, objective: v })} minLength={3} />
            <Field label="Plataforma principal" value={briefing.primaryPlatform} onChange={(v) => setBriefing({ ...briefing, primaryPlatform: v })} minLength={2} />
            <Area label="Contexto" value={briefing.context} onChange={(v) => setBriefing({ ...briefing, context: v })} minLength={3} rows={4} />
            <button
              type="submit"
              disabled={props.isGenerating || props.hasActiveJob}
              className="w-full rounded-full bg-[#F5A623] px-6 py-3.5 font-black text-[#071120] transition hover:scale-[1.005] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {props.isGenerating ? "Enviando..." : props.hasActiveJob ? "Gerando pacote..." : "Gerar pacote"}
            </button>
          </form>
        </Card>

        {props.jobs.length > 0 && (
          <Card className="mt-5">
            <CardEyebrow>Gerações recentes</CardEyebrow>
            <ul className="mt-3 space-y-2">
              {props.jobs.slice(0, 5).map((j) => (
                <li key={j.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-[#0A1728] px-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate text-[#D6D3C4]">{j.briefing?.title ?? "Pacote"}</span>
                  <StatusPill status={j.status} labels={GENERATION_STATUS_LABELS} tone={j.status === "FAILED" ? "bad" : j.status === "COMPLETED" ? "good" : "wait"} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {/* Pacote gerado */}
      <section>
        <Card className="border-[#F5A623]/25">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardEyebrow tone="amber">Pacote gerado</CardEyebrow>
            {latestArtifact && !props.publishOpen && (
              <button type="button" onClick={props.openPublish} className="rounded-full bg-[#0A66C2] px-4 py-2 text-sm font-black text-white">
                Publicar no LinkedIn
              </button>
            )}
          </div>

          {props.publishOpen ? (
            <PublishEditor {...props} />
          ) : (
            <article className="mt-4 max-h-[30rem] overflow-auto rounded-xl border border-white/8 bg-[#0A1728] p-5">
              {latestArtifact ? (
                <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-[#E7ECF3]">{latestArtifact.content}</pre>
              ) : props.hasActiveJob ? (
                <div className="flex items-center gap-3 py-10 text-sm text-[#8FA3B8]">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#F5A623] border-t-transparent" />
                  Gerando o pacote — o resultado aparece aqui sozinho.
                </div>
              ) : latestJob?.status === "FAILED" ? (
                <p className="py-8 text-sm text-red-300">A última geração falhou: {friendlyGenerationError(latestJob.error)}.</p>
              ) : (
                <p className="py-10 text-center text-sm text-[#8FA3B8]">Preencha o briefing ao lado e clique em <b className="text-[#D6D3C4]">Gerar pacote</b>. O conteúdo aparece aqui.</p>
              )}
            </article>
          )}
          {latestArtifact && !props.publishOpen && (
            <p className="mt-3 text-xs text-[#8FA3B8]">Revise e ajuste antes de publicar. Nada vai para o LinkedIn sem a sua aprovação.</p>
          )}
        </Card>
      </section>
    </div>
  );
}

function PublishEditor(props: {
  linkedinConnected: boolean;
  socialConfigured: boolean;
  publishText: string;
  setPublishText: (v: string) => void;
  publish: (e: FormEvent<HTMLFormElement>) => void;
  isPublishing: boolean;
  connectLinkedIn: () => void;
  closePublish: () => void;
  displayName: string | null;
}) {
  if (!props.socialConfigured) {
    return <p className="mt-4 rounded-xl bg-[#0A1728] p-4 text-sm text-[#8FA3B8]">Publicação no LinkedIn ainda não habilitada nesta instância.</p>;
  }
  if (!props.linkedinConnected) {
    return (
      <div className="mt-4 space-y-3 rounded-xl border border-[#0A66C2]/40 bg-[#0A1728] p-4">
        <p className="text-sm text-[#D6D3C4]">Conecte seu LinkedIn para publicar. Você revisa e aprova cada post — nada é publicado sozinho.</p>
        <button type="button" onClick={props.connectLinkedIn} className="rounded-full bg-[#0A66C2] px-5 py-2 text-sm font-black text-white">
          Conectar LinkedIn
        </button>
      </div>
    );
  }
  return (
    <form className="mt-4 rounded-xl border border-[#0A66C2]/40 bg-[#0A1728] p-4" onSubmit={props.publish}>
      <p className="text-sm font-bold text-[#7DC8F5]">Revisar e publicar</p>
      <textarea
        className="mt-3 min-h-52 w-full rounded-xl border border-white/10 bg-[#0C1A2E] px-4 py-3 text-sm leading-6 text-[#ECEFF4] outline-none focus:border-[#0A66C2]"
        value={props.publishText}
        onChange={(e) => props.setPublishText(e.target.value)}
        maxLength={3000}
        required
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-[#8FA3B8]">{props.publishText.length}/3000 · publica no perfil de {props.displayName ?? "você"}</span>
        <div className="flex gap-2">
          <button type="button" onClick={props.closePublish} className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold text-[#D6D3C4]">
            Cancelar
          </button>
          <button type="submit" disabled={props.isPublishing || !props.publishText.trim()} className="rounded-full bg-[#0A66C2] px-5 py-2 text-sm font-black text-white disabled:opacity-60">
            {props.isPublishing ? "Publicando..." : "Publicar agora"}
          </button>
        </div>
      </div>
    </form>
  );
}

/* ---------- Seção: Publicar ---------- */

function PublicarSection(props: {
  social: SocialState | null;
  linkedinConnected: boolean;
  connectLinkedIn: () => void;
  disconnectLinkedIn: () => void;
  publications: PublicationRow[];
  hasPendingPub: boolean;
  hasArtifact: boolean;
  openPublish: () => void;
}) {
  const conn = props.social?.connection;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardEyebrow tone="blue">LinkedIn</CardEyebrow>
          {props.social?.configured &&
            (props.linkedinConnected ? (
              <button type="button" onClick={props.disconnectLinkedIn} className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold text-[#D6D3C4]">
                Desconectar
              </button>
            ) : (
              <button type="button" onClick={props.connectLinkedIn} className="rounded-full bg-[#0A66C2] px-4 py-2 text-sm font-black text-white">
                Conectar LinkedIn
              </button>
            ))}
        </div>
        {!props.social?.configured ? (
          <p className="mt-3 text-sm text-[#8FA3B8]">Publicação no LinkedIn ainda não habilitada nesta instância.</p>
        ) : props.linkedinConnected ? (
          <div className="mt-3 space-y-3 text-sm text-[#D6D3C4]">
            <p>
              Conectado como <b className="text-[#ECEFF4]">{conn?.displayName ?? "membro"}</b>
              {conn?.tokenExpiresAt && <> · válido até {new Date(conn.tokenExpiresAt).toLocaleDateString("pt-BR")}</>}
              {conn?.expiringSoon && <span className="text-[#F5A623]"> · expira em breve, reconecte</span>}
            </p>
            {props.hasArtifact && (
              <button type="button" onClick={props.openPublish} className="rounded-full bg-[#0A66C2] px-5 py-2 text-sm font-black text-white">
                Publicar o último pacote
              </button>
            )}
          </div>
        ) : conn?.status === "EXPIRED" ? (
          <p className="mt-3 text-sm text-[#F5A623]">Sua conexão expirou. Reconecte para voltar a publicar.</p>
        ) : (
          <p className="mt-3 text-sm text-[#8FA3B8]">Conecte seu LinkedIn para publicar os pacotes gerados. Cada publicação passa pela sua aprovação — o LinkedIn não permite postagem automática sem a sua ação.</p>
        )}
      </Card>

      <Card>
        <CardEyebrow>Histórico de publicações</CardEyebrow>
        {props.publications.length === 0 ? (
          <p className="mt-3 text-sm text-[#8FA3B8]">Nenhuma publicação ainda.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {props.publications.slice(0, 8).map((p) => (
              <li key={p.id} className="rounded-xl border border-white/8 bg-[#0A1728] p-3">
                <div className="flex items-center justify-between gap-2">
                  <StatusPill status={p.status} labels={PUBLICATION_STATUS_LABELS} tone={p.status === "FAILED" ? "bad" : p.status === "PUBLISHED" ? "good" : "wait"} />
                  {p.externalUrl && p.status === "PUBLISHED" && (
                    <a className="text-xs font-bold text-[#7DC8F5] underline" href={p.externalUrl} target="_blank" rel="noreferrer">
                      ver no LinkedIn
                    </a>
                  )}
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-[#D6D3C4]">{p.commentary}</p>
                {p.status === "FAILED" && p.error && <p className="mt-1 text-xs text-red-300">{publicationError(p.error)}</p>}
              </li>
            ))}
          </ul>
        )}
        {props.hasPendingPub && <p className="mt-3 text-xs text-[#8FA3B8]">Publicações na fila são enviadas em instantes.</p>}
      </Card>
    </div>
  );
}

/* ---------- Seção: Voz da marca ---------- */

type Brand = typeof initialBrand;
function MarcaSection(props: { brand: Brand; setBrand: (b: Brand) => void; save: (e: FormEvent<HTMLFormElement>) => void; saving: boolean }) {
  const { brand, setBrand } = props;
  return (
    <Card className="max-w-3xl">
      <CardEyebrow tone="blue">Voz da marca</CardEyebrow>
      <p className="mt-1 text-sm text-[#8FA3B8]">Este é o contexto que o Cortex usa em toda geração — quanto melhor, mais o conteúdo soa como você.</p>
      <form className="mt-5 space-y-4" onSubmit={props.save}>
        <Field label="Tom" value={brand.tone} onChange={(v) => setBrand({ ...brand, tone: v })} minLength={3} placeholder="formal, técnico, humano, direto" />
        <Field label="Público" value={brand.audience} onChange={(v) => setBrand({ ...brand, audience: v })} minLength={3} />
        <Field label="Promessa" value={brand.promise} onChange={(v) => setBrand({ ...brand, promise: v })} minLength={3} />
        <Area label="Restrições (uma por linha)" value={brand.restrictionsText} onChange={(v) => setBrand({ ...brand, restrictionsText: v })} rows={3} placeholder={"sem jargão de guru\nsem promessas irreais"} />
        <Area label="Exemplo de texto aprovado" value={brand.sampleContent} onChange={(v) => setBrand({ ...brand, sampleContent: v })} rows={4} />
        <button type="submit" disabled={props.saving} className="rounded-full bg-[#F5A623] px-6 py-3 font-black text-[#071120] disabled:opacity-60">
          {props.saving ? "Salvando..." : "Salvar voz da marca"}
        </button>
      </form>
    </Card>
  );
}

/* ---------- Seção: Conta ---------- */

type Credential = typeof initialCredential;
function ContaSection(props: {
  email: string;
  billing: BillingState | null;
  subscription: BillingState["subscription"];
  subscriptionBlocked: boolean;
  busyBilling: boolean;
  billingAction: (a: "cancel" | "resume" | "regenerate_invoice") => void;
  quota?: JobsPayload["quotaStatus"];
  metrics?: JobsPayload["metrics"];
  credential: LlmCredentialStatus | null;
  credentialForm: Credential;
  setCredentialForm: (c: Credential) => void;
  saveCredential: (e: FormEvent<HTMLFormElement>) => void;
  removeCredential: () => void;
  showDelete: boolean;
  setShowDelete: (v: boolean) => void;
  deletePassword: string;
  setDeletePassword: (v: string) => void;
  deleteAccount: (e: FormEvent<HTMLFormElement>) => void;
  isDeleting: boolean;
}) {
  const { subscription, quota, credential, credentialForm, setCredentialForm } = props;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardEyebrow>Sua conta</CardEyebrow>
        <p className="mt-2 text-sm text-[#D6D3C4]">{props.email}</p>
        {quota && (
          <div className="mt-4 rounded-xl border border-white/8 bg-[#0A1728] p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-bold">Plano {quota.plan}</span>
              <span className="text-[#8FA3B8]">{quota.remainingTokens.toLocaleString("pt-BR")} de conteúdo restante este mês</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#071120]">
              <div className="h-full rounded-full bg-[#F5A623]" style={{ width: `${quota.usagePercent}%` }} />
            </div>
          </div>
        )}
        {props.metrics && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MiniStat label="Pacotes gerados" value={props.metrics.jobs} />
            <MiniStat label="Conteúdos salvos" value={props.metrics.artifacts} />
          </div>
        )}
      </Card>

      <Card>
        <CardEyebrow tone="amber">Assinatura</CardEyebrow>
        {props.billing?.trial ? (
          <div className="mt-2 space-y-2 text-sm text-[#D6D3C4]">
            <p>
              Teste gratuito ativo até <b className="text-[#F5A623]">{new Date(props.billing.trial.trialEndsAt).toLocaleDateString("pt-BR")}</b>.
            </p>
            <p>Para usar o modelo gerenciado pela Nutef e seguir depois do teste, assine pelo checkout Pix na página inicial (mesmo e-mail e senha).</p>
          </div>
        ) : subscription ? (
          <div className="mt-2 space-y-3 text-sm text-[#D6D3C4]">
            <p>
              Plano <b className="text-[#ECEFF4]">{subscription.plan}</b> · <b className="text-[#F5A623]">{SUBSCRIPTION_STATUS_LABELS[subscription.status] ?? subscription.status}</b>
              {subscription.currentPeriodEnd && <> · {subscription.status === "ACTIVE" ? "pago até" : "venceu em"} {new Date(subscription.currentPeriodEnd).toLocaleDateString("pt-BR")}</>}
            </p>
            {subscription.cancelAtPeriodEnd && subscription.status === "ACTIVE" && (
              <p className="rounded-xl bg-[#F5A623]/10 p-3 text-[#F5A623]">Cancelamento agendado: o acesso vai até o fim do período pago e não há nova cobrança.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {subscription.pendingInvoice?.paymentLinkUrl && (
                <a className="rounded-full bg-[#F5A623] px-5 py-2 font-black text-[#071120]" href={subscription.pendingInvoice.paymentLinkUrl} target="_blank" rel="noreferrer">
                  Pagar cobrança pendente
                </a>
              )}
              {props.subscriptionBlocked && !subscription.pendingInvoice && (
                <button type="button" disabled={props.busyBilling} onClick={() => props.billingAction("regenerate_invoice")} className="rounded-full bg-[#F5A623] px-5 py-2 font-black text-[#071120] disabled:opacity-60">
                  Gerar nova cobrança Pix
                </button>
              )}
              {subscription.status === "ACTIVE" && !subscription.cancelAtPeriodEnd && (
                <button type="button" disabled={props.busyBilling} onClick={() => props.billingAction("cancel")} className="rounded-full border border-white/20 px-5 py-2 font-bold text-[#D6D3C4] disabled:opacity-60">
                  Cancelar assinatura
                </button>
              )}
              {subscription.cancelAtPeriodEnd && subscription.status === "ACTIVE" && (
                <button type="button" disabled={props.busyBilling} onClick={() => props.billingAction("resume")} className="rounded-full border border-[#F5A623]/40 px-5 py-2 font-bold text-[#F5A623] disabled:opacity-60">
                  Manter assinatura
                </button>
              )}
            </div>
            <p className="text-xs text-[#8FA3B8]">Arrependimento em até 7 dias da primeira compra (art. 49 do CDC): escreva para contato@nutef.com.</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-[#8FA3B8]">Conta com plano gerenciado pela Nutef.</p>
        )}
      </Card>

      <Card>
        <CardEyebrow tone="amber">Sua chave de API (teste)</CardEyebrow>
        <p className="mt-1 text-sm text-[#8FA3B8]">No teste de 14 dias você usa a sua própria chave OpenAI-compatible. Ela fica criptografada, não reaparece na tela e expira sozinha.</p>
        {credential?.configured && (
          <p className="mt-3 rounded-xl bg-[#0A1728] p-3 text-sm text-[#D6D3C4]">
            {credential.trialActive ? "Ativa" : "Expirada"} · modelo {credential.model} · {credential.apiKeyPreview} · expira em {credential.trialEndsAt ? new Date(credential.trialEndsAt).toLocaleDateString("pt-BR") : "--"}
          </p>
        )}
        <form className="mt-4 space-y-3" onSubmit={props.saveCredential}>
          <Field label="Base URL" value={credentialForm.baseUrl} onChange={(v) => setCredentialForm({ ...credentialForm, baseUrl: v })} placeholder="https://api.openai.com/v1" />
          <Field label="Modelo" value={credentialForm.model} onChange={(v) => setCredentialForm({ ...credentialForm, model: v })} />
          <Field label="Chave de API" type="password" value={credentialForm.apiKey} onChange={(v) => setCredentialForm({ ...credentialForm, apiKey: v })} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="rounded-full bg-[#F5A623] px-5 py-2.5 font-black text-[#071120]">Salvar chave</button>
            {credential?.configured && (
              <button type="button" onClick={props.removeCredential} className="rounded-full border border-white/20 px-5 py-2.5 font-bold text-[#D6D3C4]">
                Remover
              </button>
            )}
          </div>
        </form>
      </Card>

      <Card className="border-red-500/25">
        <CardEyebrow tone="red">Excluir conta</CardEyebrow>
        <p className="mt-2 text-sm text-[#D6D3C4]">Remove sua conta e todos os dados (voz da marca, briefings, pacotes, publicações). Não dá para desfazer.</p>
        {!props.showDelete ? (
          <button type="button" onClick={() => props.setShowDelete(true)} className="mt-3 rounded-full border border-red-400/40 px-5 py-2 text-sm font-bold text-red-300">
            Quero excluir minha conta
          </button>
        ) : (
          <form className="mt-3 space-y-3" onSubmit={props.deleteAccount}>
            <Field label="Confirme sua senha" type="password" value={props.deletePassword} onChange={props.setDeletePassword} minLength={8} />
            <div className="flex gap-2">
              <button type="submit" disabled={props.isDeleting} className="rounded-full bg-red-500 px-5 py-2.5 font-black text-white disabled:opacity-60">
                {props.isDeleting ? "Excluindo..." : "Excluir definitivamente"}
              </button>
              <button type="button" onClick={() => props.setShowDelete(false)} className="rounded-full border border-white/20 px-5 py-2.5 font-bold text-[#D6D3C4]">
                Voltar
              </button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}

/* ---------- UI compartilhada ---------- */

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-white/10 bg-[#0C1A2E] p-5 ${className}`}>{children}</div>;
}

function CardEyebrow({ children, tone = "blue" }: { children: React.ReactNode; tone?: "blue" | "amber" | "red" }) {
  const color = tone === "amber" ? "text-[#F5A623]" : tone === "red" ? "text-red-300" : "text-[#7DC8F5]";
  return <p className={`text-sm font-bold uppercase tracking-[0.2em] ${color}`}>{children}</p>;
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  minLength,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  minLength?: number;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-[#ECEFF4]">{label}</span>
      <input
        className="w-full rounded-xl border border-white/10 bg-[#0A1728] px-4 py-3 text-[#ECEFF4] outline-none transition focus:border-[#F5A623]"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        minLength={minLength}
        placeholder={placeholder}
        required
      />
    </label>
  );
}

function Area({ label, value, onChange, rows = 3, minLength, placeholder }: { label: string; value: string; onChange: (v: string) => void; rows?: number; minLength?: number; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-[#ECEFF4]">{label}</span>
      <textarea
        className="w-full rounded-xl border border-white/10 bg-[#0A1728] px-4 py-3 text-[#ECEFF4] outline-none transition focus:border-[#F5A623]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        minLength={minLength}
        placeholder={placeholder}
        required={minLength !== undefined}
      />
    </label>
  );
}

function StatusPill({ status, labels, tone }: { status: string; labels: Record<string, string>; tone: "good" | "bad" | "wait" }) {
  const cls = tone === "bad" ? "bg-red-500/15 text-red-300" : tone === "good" ? "bg-emerald-500/15 text-emerald-300" : "bg-[#2487D8]/15 text-[#7DC8F5]";
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${cls}`}>{labels[status] ?? status}</span>;
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/8 bg-[#0A1728] p-3">
      <p className="text-2xl font-black text-[#F5A623]">{value}</p>
      <p className="mt-0.5 text-xs text-[#8FA3B8]">{label}</p>
    </div>
  );
}
