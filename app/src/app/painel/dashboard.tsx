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
type Platform = "linkedin" | "instagram";
type SocialConn = {
  platform: Platform;
  configured: boolean;
  connected: boolean;
  displayName: string | null;
  status: string | null;
  tokenExpiresAt: string | null;
  expiringSoon: boolean;
};
type SocialState = { linkedin: SocialConn; instagram: SocialConn };
type PublicationRow = {
  id: string;
  platform: string;
  commentary: string;
  status: string;
  externalUrl: string | null;
  error: string | null;
  mediaImageUrns: string[];
  mediaAssetId: string | null;
  scheduledFor: string | null;
  createdAt: string;
};

const PLATFORM_LABEL: Record<string, string> = { linkedin: "LinkedIn", instagram: "Instagram" };
// Limites por rede (espelham o backend): legenda e formatos de imagem.
const PLATFORM_LIMITS: Record<Platform, { captionMax: number; imageAccept: string; imageRequired: boolean; maxMb: number }> = {
  linkedin: { captionMax: 3000, imageAccept: "image/jpeg,image/png,image/gif", imageRequired: false, maxMb: 10 },
  instagram: { captionMax: 2200, imageAccept: "image/jpeg", imageRequired: true, maxMb: 8 },
};
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
  const [publishPlatform, setPublishPlatform] = useState<Platform>("linkedin");
  const [publishText, setPublishText] = useState("");
  const [publishArtifactId, setPublishArtifactId] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishImage, setPublishImage] = useState<File | null>(null);
  const [publishImagePreview, setPublishImagePreview] = useState<string | null>(null);
  // Imagem gerada por IA (Etapa B): guardada como MediaAsset, aprovada na prévia.
  const [genPrompt, setGenPrompt] = useState("");
  const [genAssetId, setGenAssetId] = useState<string | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");

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
    setSocial({ linkedin: d.linkedin, instagram: d.instagram });
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
  // Acompanha (polling 5s) só publicações imediatas ou prestes a sair — não as agendadas p/ dias à frente.
  // A comparação de tempo fica no effect (roda pós-render, onde Date.now é permitido).
  useEffect(() => {
    if (!ready) return;
    const imminent = publications.some(
      (p) => p.status === "PUBLISHING" || (p.status === "PENDING" && (!p.scheduledFor || new Date(p.scheduledFor).getTime() <= Date.now() + 60_000)),
    );
    if (!imminent) return;
    const t = window.setTimeout(() => loadPublications().catch(() => null), 5000);
    return () => window.clearTimeout(t);
  }, [ready, publications, loadPublications]);

  const latestJob = payload?.jobs[0];
  const latestArtifact = latestJob?.artifacts?.[0];
  const quota = payload?.quotaStatus;
  const subscription = billing?.subscription;
  const subscriptionBlocked = subscription && ["PENDING", "PAST_DUE", "INCOMPLETE"].includes(subscription.status);
  const linkedinConnected = social?.linkedin.connected ?? false;
  const instagramConnected = social?.instagram.connected ?? false;
  const anyConnected = linkedinConnected || instagramConnected;
  const anyConfigured = Boolean(social?.linkedin.configured || social?.instagram.configured);
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

  function connectSocial(platform: Platform) {
    window.location.href = `/api/social/${platform}/connect`;
  }
  async function disconnectSocial(platform: Platform) {
    const r = await fetch(`/api/social?platform=${platform}`, { method: "DELETE" });
    if (r.ok) {
      await loadSocial();
      setStatus(`${PLATFORM_LABEL[platform]} desconectado.`);
    }
  }
  function resetPublishExtras() {
    setPublishImage(null);
    setPublishImagePreview(null);
    setGenPrompt("");
    setGenAssetId(null);
    setGenBusy(false);
    setScheduleOn(false);
    setScheduleAt("");
  }
  function openPublish(platform?: Platform) {
    // Escolhe a rede: a passada, senão a primeira conectada (LinkedIn tem prioridade).
    const target: Platform = platform ?? (linkedinConnected ? "linkedin" : instagramConnected ? "instagram" : "linkedin");
    setPublishPlatform(target);
    setPublishText(extractLinkedInSection(latestArtifact?.content ?? ""));
    setPublishArtifactId(latestArtifact?.id ?? null);
    resetPublishExtras();
    setPublishOpen(true);
    setStatus(null);
  }
  function pickImage(file: File | null) {
    setPublishImage(file);
    if (file) setGenAssetId(null); // anexo e imagem gerada são mutuamente exclusivos
    setPublishImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }
  async function generatePublishImage() {
    setGenBusy(true);
    setStatus("Gerando imagem com IA — leva alguns segundos...");
    try {
      const r = await fetch("/api/media/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ platform: publishPlatform, prompt: genPrompt || undefined, commentary: publishText || undefined }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(friendlyApiError(d, r.status, "Não foi possível gerar a imagem"));
      pickImage(null);
      setGenAssetId(d.mediaAssetId as string);
      setStatus("Imagem gerada — revise a prévia. Você pode gerar outra ou publicar.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Erro ao gerar a imagem.");
    } finally {
      setGenBusy(false);
    }
  }
  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (scheduleOn && !scheduleAt) {
      setStatus("Escolha a data e a hora para agendar.");
      return;
    }
    if (PLATFORM_LIMITS[publishPlatform].imageRequired && !publishImage && !genAssetId) {
      setStatus(`O ${PLATFORM_LABEL[publishPlatform]} exige uma imagem na publicação.`);
      return;
    }
    const label = PLATFORM_LABEL[publishPlatform];
    setIsPublishing(true);
    setStatus(scheduleOn ? "Agendando publicação..." : `Enviando para o ${label}...`);
    try {
      const body = new FormData();
      body.set("platform", publishPlatform);
      body.set("commentary", publishText);
      if (publishArtifactId) body.set("artifactId", publishArtifactId);
      if (publishImage) body.set("image", publishImage);
      else if (genAssetId) body.set("mediaAssetId", genAssetId);
      if (scheduleOn && scheduleAt) body.set("scheduledFor", new Date(scheduleAt).toISOString());
      const r = await fetch("/api/publications", { method: "POST", body });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        const extra: Record<string, string> = {
          image_too_large: `A imagem passa de ${PLATFORM_LIMITS[publishPlatform].maxMb} MB. Use uma menor.`,
          image_type_unsupported: "Formato não aceito. Use JPG, PNG ou GIF.",
          instagram_formato_invalido: "O Instagram aceita imagem só em JPEG.",
          instagram_requer_imagem: "O Instagram exige uma imagem na publicação.",
          image_upload_failed: `Não foi possível enviar a imagem ao ${label}. Tente de novo.`,
        };
        throw new Error(extra[d?.error as string] ?? API_ERROR_MESSAGES[d?.error as string] ?? friendlyApiError(d, r.status, "Não foi possível publicar"));
      }
      setPublishOpen(false);
      resetPublishExtras();
      await loadPublications();
      setStatus(scheduleOn ? "Publicação agendada. Acompanhe em Publicar." : `Post na fila do ${label} — publica em instantes. Acompanhe em Publicar.`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Erro ao publicar.");
    } finally {
      setIsPublishing(false);
    }
  }
  async function cancelPublication(id: string) {
    const r = await fetch(`/api/publications?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (r.ok) {
      await loadPublications();
      setStatus("Publicação cancelada.");
    } else {
      setStatus("Não foi possível cancelar (talvez já tenha saído).");
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
    { key: "publicar", label: "Publicar", hint: "LinkedIn e Instagram" },
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
              social={social}
              anyConnected={anyConnected}
              anyConfigured={anyConfigured}
              publishOpen={publishOpen}
              openPublish={openPublish}
              closePublish={() => setPublishOpen(false)}
              publishPlatform={publishPlatform}
              setPublishPlatform={setPublishPlatform}
              publishText={publishText}
              setPublishText={setPublishText}
              publish={publish}
              isPublishing={isPublishing}
              connectSocial={connectSocial}
              imagePreview={publishImagePreview ?? (genAssetId ? `/api/media/${genAssetId}` : null)}
              isGenerated={!publishImage && Boolean(genAssetId)}
              pickImage={pickImage}
              genPrompt={genPrompt}
              setGenPrompt={setGenPrompt}
              genBusy={genBusy}
              generateImage={generatePublishImage}
              scheduleOn={scheduleOn}
              setScheduleOn={setScheduleOn}
              scheduleAt={scheduleAt}
              setScheduleAt={setScheduleAt}
            />
          )}

          {section === "publicar" && (
            <PublicarSection
              social={social}
              connectSocial={connectSocial}
              disconnectSocial={disconnectSocial}
              publications={publications}
              hasPendingPub={hasPendingPub}
              hasArtifact={Boolean(latestArtifact)}
              cancelPublication={cancelPublication}
              openPublish={(platform) => {
                setSection("criar");
                openPublish(platform);
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
  social: SocialState | null;
  anyConnected: boolean;
  anyConfigured: boolean;
  publishOpen: boolean;
  openPublish: (platform?: Platform) => void;
  closePublish: () => void;
  publishPlatform: Platform;
  setPublishPlatform: (p: Platform) => void;
  publishText: string;
  setPublishText: (v: string) => void;
  publish: (e: FormEvent<HTMLFormElement>) => void;
  isPublishing: boolean;
  connectSocial: (platform: Platform) => void;
  imagePreview: string | null;
  isGenerated: boolean;
  pickImage: (f: File | null) => void;
  genPrompt: string;
  setGenPrompt: (v: string) => void;
  genBusy: boolean;
  generateImage: () => void;
  scheduleOn: boolean;
  setScheduleOn: (v: boolean) => void;
  scheduleAt: string;
  setScheduleAt: (v: string) => void;
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
              <button type="button" onClick={() => props.openPublish()} className="rounded-full bg-[#F5A623] px-4 py-2 text-sm font-black text-[#071120]">
                Publicar
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
            <p className="mt-3 text-xs text-[#8FA3B8]">Revise e ajuste antes de publicar. Nada é publicado sem a sua aprovação.</p>
          )}
        </Card>
      </section>
    </div>
  );
}

const PLATFORM_ACCENT: Record<Platform, string> = { linkedin: "#0A66C2", instagram: "#E1306C" };

function PublishEditor(props: {
  social: SocialState | null;
  publishPlatform: Platform;
  setPublishPlatform: (p: Platform) => void;
  publishText: string;
  setPublishText: (v: string) => void;
  publish: (e: FormEvent<HTMLFormElement>) => void;
  isPublishing: boolean;
  connectSocial: (p: Platform) => void;
  closePublish: () => void;
  imagePreview: string | null;
  isGenerated: boolean;
  pickImage: (f: File | null) => void;
  genPrompt: string;
  setGenPrompt: (v: string) => void;
  genBusy: boolean;
  generateImage: () => void;
  scheduleOn: boolean;
  setScheduleOn: (v: boolean) => void;
  scheduleAt: string;
  setScheduleAt: (v: string) => void;
}) {
  const platform = props.publishPlatform;
  const conn = props.social?.[platform];
  const limits = PLATFORM_LIMITS[platform];
  const accent = PLATFORM_ACCENT[platform];
  const configured = (["linkedin", "instagram"] as Platform[]).filter((p) => props.social?.[p]?.configured);

  if (configured.length === 0) {
    return <p className="mt-4 rounded-xl bg-[#0A1728] p-4 text-sm text-[#8FA3B8]">Publicação em redes sociais ainda não habilitada nesta instância.</p>;
  }

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-[#0A1728] p-4">
      {/* Seletor de rede — só aparece quando há mais de uma habilitada */}
      {configured.length > 1 ? (
        <div className="inline-flex rounded-full border border-white/10 bg-[#0C1A2E] p-1">
          {configured.map((p) => {
            const on = p === platform;
            return (
              <button
                key={p}
                type="button"
                onClick={() => props.setPublishPlatform(p)}
                className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${on ? "text-white" : "text-[#8FA3B8] hover:text-[#D6D3C4]"}`}
                style={on ? { backgroundColor: PLATFORM_ACCENT[p] } : undefined}
              >
                {PLATFORM_LABEL[p]}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-sm font-bold" style={{ color: accent }}>
          Publicar no {PLATFORM_LABEL[platform]}
        </p>
      )}

      {!conn?.connected ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-[#D6D3C4]">
            Conecte seu {PLATFORM_LABEL[platform]} para publicar. Você revisa e aprova cada post — nada é publicado sozinho.
          </p>
          <button type="button" onClick={() => props.connectSocial(platform)} className="rounded-full px-5 py-2 text-sm font-black text-white" style={{ backgroundColor: accent }}>
            Conectar {PLATFORM_LABEL[platform]}
          </button>
        </div>
      ) : (
        <form className="mt-4" onSubmit={props.publish}>
          <textarea
            className="min-h-44 w-full rounded-xl border border-white/10 bg-[#0C1A2E] px-4 py-3 text-sm leading-6 text-[#ECEFF4] outline-none focus:border-white/30"
            value={props.publishText}
            onChange={(e) => props.setPublishText(e.target.value)}
            maxLength={limits.captionMax}
            required
          />
          <p className="mt-1 text-xs text-[#8FA3B8]">
            {props.publishText.length}/{limits.captionMax} · publica em {conn.displayName ?? "sua conta"}
          </p>

          {/* Imagem: anexada pelo usuário OU gerada por IA (com prévia e aprovação) */}
          <div className="mt-3">
            {props.imagePreview ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={props.imagePreview} alt="Prévia da imagem" className="h-24 w-24 rounded-lg object-cover" />
                <div className="flex flex-col items-start gap-1.5">
                  {props.isGenerated && (
                    <>
                      <span className="rounded-full bg-[#F5A623]/15 px-2 py-0.5 text-[11px] font-bold text-[#F5A623]">gerada por IA — revise antes de publicar</span>
                      <button type="button" onClick={props.generateImage} disabled={props.genBusy} className="text-sm font-semibold text-[#7DC8F5] underline disabled:opacity-60">
                        {props.genBusy ? "Gerando outra..." : "Gerar outra"}
                      </button>
                    </>
                  )}
                  <button type="button" onClick={() => props.pickImage(null)} className="text-sm font-semibold text-[#D6D3C4] underline">
                    Remover imagem
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-[#D6D3C4] hover:border-white/30">
                    + Anexar imagem
                    <input type="file" accept={limits.imageAccept} className="hidden" onChange={(e) => props.pickImage(e.target.files?.[0] ?? null)} />
                  </label>
                  <span className="text-xs text-[#8FA3B8]">ou</span>
                  <button
                    type="button"
                    onClick={props.generateImage}
                    disabled={props.genBusy}
                    className="inline-flex items-center gap-2 rounded-lg border border-[#F5A623]/40 px-3 py-2 text-sm font-semibold text-[#F5A623] hover:border-[#F5A623] disabled:opacity-60"
                  >
                    {props.genBusy ? "Gerando imagem..." : "✦ Gerar com IA"}
                  </button>
                </div>
                <input
                  type="text"
                  value={props.genPrompt}
                  onChange={(e) => props.setGenPrompt(e.target.value)}
                  maxLength={800}
                  placeholder="Descreva a imagem (opcional — sem descrição, uso o texto do post)"
                  className="w-full rounded-lg border border-white/10 bg-[#0C1A2E] px-3 py-2 text-sm text-[#ECEFF4] outline-none placeholder:text-[#5C7186] focus:border-white/30"
                />
              </div>
            )}
            <p className="mt-1.5 text-xs text-[#8FA3B8]">
              {limits.imageRequired ? "Imagem obrigatória · JPEG" : "Imagem opcional · JPG, PNG ou GIF"} · até {limits.maxMb} MB
            </p>
          </div>

          {/* Agendamento (opcional) */}
          <div className="mt-3 space-y-2">
            <label className="flex items-center gap-2 text-sm text-[#D6D3C4]">
              <input type="checkbox" checked={props.scheduleOn} onChange={(e) => props.setScheduleOn(e.target.checked)} className="accent-[#F5A623]" />
              Agendar para depois
            </label>
            {props.scheduleOn && (
              <input
                type="datetime-local"
                value={props.scheduleAt}
                onChange={(e) => props.setScheduleAt(e.target.value)}
                className="rounded-lg border border-white/10 bg-[#0C1A2E] px-3 py-2 text-sm text-[#ECEFF4] outline-none focus:border-white/30"
              />
            )}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={props.closePublish} className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold text-[#D6D3C4]">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={props.isPublishing || props.genBusy || !props.publishText.trim() || (limits.imageRequired && !props.imagePreview)}
              className="rounded-full px-5 py-2 text-sm font-black text-white disabled:opacity-60"
              style={{ backgroundColor: accent }}
            >
              {props.isPublishing ? (props.scheduleOn ? "Agendando..." : "Publicando...") : props.scheduleOn ? "Agendar" : "Publicar agora"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ---------- Seção: Publicar ---------- */

function PublicarSection(props: {
  social: SocialState | null;
  connectSocial: (p: Platform) => void;
  disconnectSocial: (p: Platform) => void;
  publications: PublicationRow[];
  hasPendingPub: boolean;
  hasArtifact: boolean;
  cancelPublication: (id: string) => void;
  openPublish: (platform?: Platform) => void;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        {(["linkedin", "instagram"] as Platform[]).map((p) => (
          <ConnectionCard
            key={p}
            platform={p}
            conn={props.social?.[p]}
            connect={() => props.connectSocial(p)}
            disconnect={() => props.disconnectSocial(p)}
            openPublish={() => props.openPublish(p)}
            hasArtifact={props.hasArtifact}
          />
        ))}
      </div>

      <Card>
        <CardEyebrow>Histórico de publicações</CardEyebrow>
        {props.publications.length === 0 ? (
          <p className="mt-3 text-sm text-[#8FA3B8]">Nenhuma publicação ainda.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {props.publications.slice(0, 8).map((p) => {
              const isScheduled = p.status === "PENDING" && Boolean(p.scheduledFor);
              const hasImage = Boolean(p.mediaAssetId) || p.mediaImageUrns.length > 0;
              const label = PLATFORM_LABEL[p.platform] ?? "rede";
              return (
                <li key={p.id} className="rounded-xl border border-white/8 bg-[#0A1728] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ backgroundColor: PLATFORM_ACCENT[p.platform as Platform] ?? "#0A66C2" }}>
                        {label}
                      </span>
                      <StatusPill status={p.status} labels={PUBLICATION_STATUS_LABELS} tone={p.status === "FAILED" ? "bad" : p.status === "PUBLISHED" ? "good" : "wait"} />
                      {hasImage && <span className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] text-[#8FA3B8]">com imagem</span>}
                    </span>
                    {p.externalUrl && p.status === "PUBLISHED" && (
                      <a className="text-xs font-bold text-[#7DC8F5] underline" href={p.externalUrl} target="_blank" rel="noreferrer">
                        ver no {label}
                      </a>
                    )}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-[#D6D3C4]">{p.commentary}</p>
                  {isScheduled && (
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-xs text-[#7DC8F5]">Agendado para {new Date(p.scheduledFor!).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                      <button type="button" onClick={() => props.cancelPublication(p.id)} className="text-xs font-semibold text-[#D6D3C4] underline">
                        Cancelar
                      </button>
                    </div>
                  )}
                  {p.status === "FAILED" && p.error && <p className="mt-1 text-xs text-red-300">{publicationError(p.error)}</p>}
                </li>
              );
            })}
          </ul>
        )}
        {props.hasPendingPub && <p className="mt-3 text-xs text-[#8FA3B8]">Publicações na fila são enviadas em instantes.</p>}
      </Card>
    </div>
  );
}

function ConnectionCard(props: {
  platform: Platform;
  conn: SocialConn | undefined;
  connect: () => void;
  disconnect: () => void;
  openPublish: () => void;
  hasArtifact: boolean;
}) {
  const { platform, conn } = props;
  const label = PLATFORM_LABEL[platform];
  const accent = PLATFORM_ACCENT[platform];
  const connected = conn?.connected ?? false;
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide text-white" style={{ backgroundColor: accent }}>
          {label}
        </span>
        {conn?.configured &&
          (connected ? (
            <button type="button" onClick={props.disconnect} className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold text-[#D6D3C4]">
              Desconectar
            </button>
          ) : (
            <button type="button" onClick={props.connect} className="rounded-full px-4 py-2 text-sm font-black text-white" style={{ backgroundColor: accent }}>
              Conectar {label}
            </button>
          ))}
      </div>
      {!conn?.configured ? (
        <p className="mt-3 text-sm text-[#8FA3B8]">Publicação no {label} ainda não habilitada nesta instância.</p>
      ) : connected ? (
        <div className="mt-3 space-y-3 text-sm text-[#D6D3C4]">
          <p>
            Conectado como <b className="text-[#ECEFF4]">{conn?.displayName ?? "sua conta"}</b>
            {conn?.tokenExpiresAt && <> · válido até {new Date(conn.tokenExpiresAt).toLocaleDateString("pt-BR")}</>}
            {conn?.expiringSoon && <span className="text-[#F5A623]"> · expira em breve, reconecte</span>}
          </p>
          {props.hasArtifact && (
            <button type="button" onClick={props.openPublish} className="rounded-full px-5 py-2 text-sm font-black text-white" style={{ backgroundColor: accent }}>
              Publicar o último pacote
            </button>
          )}
          {platform === "instagram" && <p className="text-xs text-[#8FA3B8]">O Instagram publica sempre com imagem — anexe uma na hora de publicar.</p>}
        </div>
      ) : conn?.status === "EXPIRED" ? (
        <p className="mt-3 text-sm text-[#F5A623]">Sua conexão do {label} expirou. Reconecte para voltar a publicar.</p>
      ) : (
        <p className="mt-3 text-sm text-[#8FA3B8]">Conecte seu {label} para publicar os pacotes gerados. Cada publicação passa pela sua aprovação — nada é postado sozinho.</p>
      )}
    </Card>
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
              <span className="text-[#8FA3B8]">{quota.usagePercent}% do limite usado este mês</span>
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
