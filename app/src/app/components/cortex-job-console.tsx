"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  error?: string | null;
  output?: { status?: string } | null;
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

type LlmCredentialStatus = {
  configured: boolean;
  provider: string | null;
  baseUrl: string | null;
  model: string | null;
  apiKeyPreview: string | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialActive: boolean;
  enabled: boolean;
};

type LlmCredentialForm = {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
};

type BillingState = {
  plan: string;
  trial: { trialEndsAt: string } | null;
  subscription: {
    plan: string;
    status: string;
    amountCents: number;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    pendingInvoice: { paymentLinkUrl: string | null; expiresAt: string | null } | null;
  } | null;
};

type SocialState = {
  configured: boolean;
  connection: {
    connected: boolean;
    displayName: string | null;
    status: string | null;
    tokenExpiresAt: string | null;
    expiringSoon: boolean;
  };
};

type PublicationRow = {
  id: string;
  platform: string;
  commentary: string;
  status: string;
  externalUrl: string | null;
  error: string | null;
  publishedAt: string | null;
  createdAt: string;
};

const API_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "E-mail ou senha incorretos.",
  invalid_input: "Dados inválidos — confira os campos preenchidos.",
  rate_limited: "Muitas tentativas em sequência. Aguarde alguns minutos e tente de novo.",
  auth_required: "Sua sessão expirou. Faça login novamente.",
  quota_exceeded: "A quota mensal de tokens do seu plano acabou. Ela renova no próximo mês ou com upgrade de plano.",
  job_input_token_limit_exceeded: "O briefing está longo demais para uma execução. Resuma o contexto e tente de novo.",
  monthly_quota_exceeded: "A quota mensal de tokens do seu plano acabou.",
  billing_blocked: "Sua assinatura está pendente ou vencida. Regularize o pagamento para continuar gerando.",
  trial_requires_byok: "No teste de 14 dias, cadastre sua própria chave API (seção ao lado) antes de gerar conteúdo.",
  trial_expired: "Seu teste de 14 dias terminou. Assine um plano pago para continuar usando o Cortex.",
  email_already_registered: "Este e-mail já tem conta. Faça login ou use \"Esqueci minha senha\".",
  email_or_company_already_exists: "Este e-mail já tem conta. Para retomar uma compra, use a mesma senha da conta.",
  tenant_already_subscribed: "Esta conta já tem assinatura ativa. Fale com contato@nutef.com para mudar de plano.",
  no_active_subscription: "Não há assinatura ativa para esta conta.",
  woovi_not_configured: "Pagamentos indisponíveis no momento. Tente novamente em instantes.",
};

const JOB_STATUS_LABELS: Record<string, string> = {
  PENDING: "Na fila",
  PROCESSING: "Gerando",
  COMPLETED: "Concluído",
  FAILED: "Falhou",
  CANCELLED: "Cancelado",
};

const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  PENDING: "Aguardando pagamento",
  ACTIVE: "Ativa",
  PAST_DUE: "Vencida",
  CANCELED: "Cancelada",
  INCOMPLETE: "Incompleta",
};

const PUBLICATION_STATUS_LABELS: Record<string, string> = {
  PENDING: "Na fila",
  PUBLISHING: "Publicando",
  PUBLISHED: "Publicado",
  FAILED: "Falhou",
  CANCELLED: "Cancelado",
};

const SOCIAL_QUERY_MESSAGES: Record<string, string> = {
  linkedin_conectado: "LinkedIn conectado com sucesso.",
  linkedin_erro: "Não foi possível conectar o LinkedIn. Tente novamente.",
  linkedin_negado: "Conexão com o LinkedIn cancelada.",
};

const PUBLICATION_ERROR_MESSAGES: Record<string, string> = {
  conexao_expirada_reconecte: "a conexão do LinkedIn expirou — reconecte para publicar",
  permissao_negada_linkedin: "o LinkedIn recusou a permissão de publicação",
  worker_interrompido_sem_tentativas: "o processamento foi interrompido",
};

// Extrai a seção "Post LinkedIn" do artifact em Markdown para pré-preencher o editor.
function extractLinkedInSection(markdown: string): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => /^#{1,3}\s+.*linkedin/i.test(l));
  if (start === -1) return markdown.trim();
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#{1,3}\s+/.test(l));
  const body = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
  return body || markdown.trim();
}

function friendlyApiError(payload: { error?: string } | null, httpStatus: number, fallback: string) {
  const slug = payload?.error;
  if (slug && API_ERROR_MESSAGES[slug]) {
    return API_ERROR_MESSAGES[slug];
  }
  if (httpStatus === 429) {
    return API_ERROR_MESSAGES.rate_limited;
  }
  return `${fallback} (erro ${slug ?? httpStatus}).`;
}

function friendlyJobError(error?: string | null) {
  if (!error) return "erro não informado";
  if (error.includes("http_401") || error.includes("http_403")) return "a chave API foi recusada pelo provider — confira a chave cadastrada";
  if (error.includes("timeout")) return "o provider de IA demorou demais para responder";
  if (error.includes("empty_openai_compatible")) return "o provider de IA devolveu resposta vazia";
  if (error.startsWith("openai_compatible_http_")) return `o provider de IA respondeu com erro (${error.replace("openai_compatible_http_", "HTTP ")})`;
  if (error.startsWith("worker_interrompido")) return "o processamento foi interrompido no meio";
  return error;
}

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

const initialLlmCredential: LlmCredentialForm = {
  provider: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  apiKey: "",
};

const initialRegisterForm = { name: "", company: "", email: "", password: "" };

export function CortexJobConsole() {
  const [form, setForm] = useState(initialForm);
  const [brandProfile, setBrandProfile] = useState(initialBrandProfile);
  const [llmCredentialForm, setLlmCredentialForm] = useState(initialLlmCredential);
  const [llmCredential, setLlmCredential] = useState<LlmCredentialStatus | null>(null);
  const [login, setLogin] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState(initialRegisterForm);
  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  const [auth, setAuth] = useState<AuthState>({ authenticated: false });
  const [payload, setPayload] = useState<JobsPayload | null>(null);
  const [billing, setBilling] = useState<BillingState | null>(null);
  const [status, setStatus] = useState("Verificando sessão segura...");
  const [actionLink, setActionLink] = useState<{ href: string; label: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isBillingAction, setIsBillingAction] = useState(false);
  const [social, setSocial] = useState<SocialState | null>(null);
  const [publications, setPublications] = useState<PublicationRow[]>([]);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishText, setPublishText] = useState("");
  const [publishArtifactId, setPublishArtifactId] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  // Detecta a transição "gerando → terminou" entre atualizações do polling para
  // anunciar o desfecho (sucesso, contingência ou falha) sem o cliente recarregar nada.
  const wasGeneratingRef = useRef(false);

  const loadJobs = useCallback(async (options?: { silent?: boolean }) => {
    const response = await fetch("/api/jobs", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Falha ao carregar jobs: ${response.status}`);
    }
    const data = (await response.json()) as JobsPayload;
    setPayload(data);

    const active = data.jobs.some((job) => job.status === "PENDING" || job.status === "PROCESSING");
    const latest = data.jobs[0];
    if (options?.silent) {
      if (wasGeneratingRef.current && !active && latest) {
        if (latest.status === "COMPLETED") {
          setStatus(
            latest.output?.status === "fallback"
              ? "Pacote entregue em modo de contingência (IA indisponível no momento) — sem consumo de quota."
              : "Pacote pronto — confira o artifact abaixo.",
          );
        } else if (latest.status === "FAILED") {
          setStatus(`A geração falhou: ${friendlyJobError(latest.error)}. Você pode tentar novamente.`);
        }
      }
    } else {
      setStatus("Dados sincronizados com o seu tenant.");
    }
    wasGeneratingRef.current = active;
  }, []);

  const loadBilling = useCallback(async () => {
    const response = await fetch("/api/billing", { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    setBilling({ plan: data.plan, trial: data.trial, subscription: data.subscription });
  }, []);

  const loadSocial = useCallback(async () => {
    const response = await fetch("/api/social", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    setSocial({ configured: data.configured, connection: data.connection });
  }, []);

  const loadPublications = useCallback(async () => {
    const response = await fetch("/api/publications", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    setPublications(data.publications ?? []);
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

  const loadLlmCredential = useCallback(async () => {
    const response = await fetch("/api/llm-credential", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Falha ao carregar chave LLM: ${response.status}`);
    }
    const data = await response.json();
    const credential = data.credential as LlmCredentialStatus;
    setLlmCredential(credential);
    if (credential.configured) {
      setLlmCredentialForm((current) => ({
        ...current,
        provider: credential.provider ?? current.provider,
        baseUrl: credential.baseUrl ?? current.baseUrl,
        model: credential.model ?? current.model,
        apiKey: "",
      }));
    }
  }, []);

  const loadSessionAndJobs = useCallback(async () => {
    const me = await fetch("/api/auth/me", { cache: "no-store" });

    if (me.status === 401) {
      setAuth({ authenticated: false });
      setPayload(null);
      setBilling(null);
      setStatus("Faça login ou crie sua conta de teste para acessar o console.");
      return;
    }

    if (!me.ok) {
      throw new Error(`Falha ao verificar sessão: ${me.status}`);
    }

    const session = await me.json();
    setAuth({ authenticated: true, email: session.user.email, tenantId: session.tenantId });
    await Promise.all([loadBrandProfile(), loadLlmCredential(), loadJobs(), loadBilling(), loadSocial(), loadPublications()]);
  }, [loadBrandProfile, loadLlmCredential, loadJobs, loadBilling, loadSocial, loadPublications]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadSessionAndJobs().catch((error) => {
        setStatus(error instanceof Error ? error.message : "Erro ao carregar sessão.");
      });
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadSessionAndJobs]);

  // Mensagem de retorno do OAuth do LinkedIn (?social=…), lida uma vez e limpa da URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const param = new URLSearchParams(window.location.search).get("social");
    if (!param || !SOCIAL_QUERY_MESSAGES[param]) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("social");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    const timeout = window.setTimeout(() => setStatus(SOCIAL_QUERY_MESSAGES[param]), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const hasActiveJobs = useMemo(
    () => (payload?.jobs ?? []).some((job) => job.status === "PENDING" || job.status === "PROCESSING"),
    [payload],
  );

  // Enquanto houver job na fila/gerando, o console se atualiza sozinho a cada 5s.
  useEffect(() => {
    if (!auth.authenticated || !hasActiveJobs) {
      return;
    }
    const timeout = window.setTimeout(() => {
      loadJobs({ silent: true }).catch(() => null);
    }, 5000);
    return () => window.clearTimeout(timeout);
  }, [auth.authenticated, hasActiveJobs, payload, loadJobs]);

  // Publicações na fila (PENDING/PUBLISHING) são acompanhadas até concluir.
  const hasPendingPub = useMemo(() => publications.some((p) => p.status === "PENDING" || p.status === "PUBLISHING"), [publications]);
  useEffect(() => {
    if (!auth.authenticated || !hasPendingPub) return;
    const timeout = window.setTimeout(() => {
      loadPublications().catch(() => null);
    }, 5000);
    return () => window.clearTimeout(timeout);
  }, [auth.authenticated, hasPendingPub, publications, loadPublications]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoggingIn(true);
    setActionLink(null);
    setStatus("Autenticando sessão segura...");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(login),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(friendlyApiError(errorPayload, response.status, "Não foi possível fazer login"));
      }

      await loadSessionAndJobs();
      setStatus("Login concluído. Bem-vindo de volta.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Erro ao fazer login.");
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsRegistering(true);
    setActionLink(null);
    setStatus("Criando sua conta de teste...");

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(registerForm),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(friendlyApiError(errorPayload, response.status, "Não foi possível criar a conta"));
      }

      await loadSessionAndJobs();
      setStatus("Conta de teste criada. Cadastre sua chave API (seção Teste de 14 dias) para gerar o primeiro pacote.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Erro ao criar conta.");
    } finally {
      setIsRegistering(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuth({ authenticated: false });
    setPayload(null);
    setBilling(null);
    setSocial(null);
    setPublications([]);
    setPublishOpen(false);
    setActionLink(null);
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
        throw new Error(friendlyApiError(errorPayload, response.status, "Não foi possível salvar a voz da marca"));
      }

      await loadBrandProfile();
      setStatus("Voz da marca salva. As próximas gerações já usam este perfil.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Erro ao salvar voz da marca.");
    }
  }

  async function handleLlmCredentialSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Salvando sua própria chave API para o Teste de 14 dias...");

    try {
      const response = await fetch("/api/llm-credential", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(llmCredentialForm),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(friendlyApiError(errorPayload, response.status, "Não foi possível salvar a chave"));
      }

      await loadLlmCredential();
      setLlmCredentialForm((current) => ({ ...current, apiKey: "" }));
      setStatus("Chave API salva. Teste de 14 dias ativo — já dá para gerar o primeiro pacote.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Erro ao salvar chave LLM.");
    }
  }

  async function handleDeleteLlmCredential() {
    setStatus("Removendo chave API do tenant...");
    try {
      const response = await fetch("/api/llm-credential", { method: "DELETE" });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(friendlyApiError(errorPayload, response.status, "Não foi possível remover a chave"));
      }
      await loadLlmCredential();
      setStatus("Chave API removida.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Erro ao remover chave LLM.");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setActionLink(null);
    setStatus("Enviando briefing para a fila de geração...");

    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        if (errorPayload?.paymentLinkUrl) {
          setActionLink({ href: errorPayload.paymentLinkUrl, label: "Pagar com Pix para regularizar" });
        }
        throw new Error(friendlyApiError(errorPayload, response.status, "Não foi possível criar o pacote"));
      }

      await loadJobs({ silent: true });
      setStatus("Pacote na fila — gerando com IA. O resultado aparece aqui em instantes.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Erro ao criar pacote.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBillingAction(action: "cancel" | "resume" | "regenerate_invoice") {
    setIsBillingAction(true);
    const messages = {
      cancel: "Agendando cancelamento...",
      resume: "Revertendo cancelamento...",
      regenerate_invoice: "Gerando nova cobrança Pix...",
    } as const;
    setStatus(messages[action]);

    try {
      const response = await fetch("/api/billing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(friendlyApiError(data, response.status, "Não foi possível concluir a ação"));
      }
      await loadBilling();
      if (action === "regenerate_invoice" && data?.paymentLinkUrl) {
        setActionLink({ href: data.paymentLinkUrl, label: "Abrir cobrança Pix" });
        setStatus("Nova cobrança Pix gerada.");
      } else {
        setStatus(action === "cancel" ? "Cancelamento agendado para o fim do período pago." : "Assinatura reativada.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Erro na ação de assinatura.");
    } finally {
      setIsBillingAction(false);
    }
  }

  async function handleDeleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsDeleting(true);
    setStatus("Excluindo conta e dados...");

    try {
      const response = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: deletePassword }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(friendlyApiError(data, response.status, "Não foi possível excluir a conta"));
      }
      setAuth({ authenticated: false });
      setPayload(null);
      setBilling(null);
      setShowDeleteConfirm(false);
      setDeletePassword("");
      setStatus("Conta excluída. Seus dados foram removidos.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Erro ao excluir conta.");
    } finally {
      setIsDeleting(false);
    }
  }

  function handleConnectLinkedIn() {
    // Redireciona para o início do OAuth (o endpoint responde 302 para o LinkedIn).
    window.location.href = "/api/social/linkedin/connect";
  }

  async function handleDisconnectLinkedIn() {
    setStatus("Desconectando LinkedIn...");
    try {
      const response = await fetch("/api/social", { method: "DELETE" });
      if (!response.ok) throw new Error("falha");
      await loadSocial();
      setStatus("LinkedIn desconectado.");
    } catch {
      setStatus("Não foi possível desconectar. Tente novamente.");
    }
  }

  function openPublishEditor() {
    const content = latestArtifact?.content ?? "";
    setPublishText(extractLinkedInSection(content));
    setPublishArtifactId(latestArtifact?.id ?? null);
    setPublishOpen(true);
  }

  async function handlePublish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPublishing(true);
    setStatus("Enviando para publicação no LinkedIn...");
    try {
      const response = await fetch("/api/publications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commentary: publishText, artifactId: publishArtifactId ?? undefined }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const messages: Record<string, string> = {
          not_connected: "Conecte seu LinkedIn antes de publicar.",
          connection_expired: "Sua conexão do LinkedIn expirou — reconecte para publicar.",
        };
        throw new Error(messages[data?.error as string] ?? friendlyApiError(data, response.status, "Não foi possível publicar"));
      }
      setPublishOpen(false);
      await loadPublications();
      setStatus("Post enviado para a fila do LinkedIn — publica em instantes.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Erro ao publicar.");
    } finally {
      setIsPublishing(false);
    }
  }

  const latestJob = payload?.jobs[0];
  const latestArtifact = latestJob?.artifacts?.[0];
  const quotaStatus = payload?.quotaStatus;
  const subscription = billing?.subscription;
  const subscriptionBlocked = subscription && ["PENDING", "PAST_DUE", "INCOMPLETE"].includes(subscription.status);
  const linkedinConnected = social?.connection.connected ?? false;

  return (
    <div className="rounded-[2rem] border border-[#2487D8]/20 bg-[#071120] p-5 shadow-2xl shadow-black/30 lg:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-[#2487D8]">Console do cliente</p>
          <h3 className="mt-3 text-2xl font-black">Entrar no Cortex</h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#D6D3C4]">
            Acesse sua conta para editar a voz da marca, criar jobs de conteúdo e acompanhar histórico, quota e custo estimado do tenant.
          </p>
          {auth.authenticated && <p className="mt-2 text-sm text-[#7DC8F5]">Sessão: {auth.email}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span aria-live="polite" className="rounded-full bg-[#F5A623]/15 px-4 py-2 text-sm font-semibold text-[#F5A623]">{status}</span>
          {actionLink && (
            <a className="rounded-full bg-[#F5A623] px-4 py-2 text-sm font-black text-[#071120]" href={actionLink.href} target="_blank" rel="noreferrer">
              {actionLink.label}
            </a>
          )}
          {auth.authenticated && (
            <button className="text-sm font-semibold text-[#D6D3C4] underline" onClick={handleLogout} type="button">
              Sair
            </button>
          )}
        </div>
      </div>

      {!auth.authenticated ? (
        <div className="rounded-2xl border border-white/10 bg-[#0C1A2E] p-5">
          <div className="mb-5 flex gap-2">
            <button
              className={`rounded-full px-5 py-2 text-sm font-bold transition ${authTab === "login" ? "bg-[#F5A623] text-[#071120]" : "border border-white/15 text-[#D6D3C4]"}`}
              type="button"
              onClick={() => setAuthTab("login")}
            >
              Já tenho conta
            </button>
            <button
              className={`rounded-full px-5 py-2 text-sm font-bold transition ${authTab === "register" ? "bg-[#F5A623] text-[#071120]" : "border border-white/15 text-[#D6D3C4]"}`}
              type="button"
              onClick={() => setAuthTab("register")}
            >
              Criar conta de teste (14 dias)
            </button>
          </div>

          {authTab === "login" ? (
            <form className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end" onSubmit={handleLogin}>
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
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleRegister}>
              <p className="md:col-span-2 text-sm leading-6 text-[#D6D3C4]">
                Teste o Cortex por 14 dias sem pagar nada: você usa a sua própria chave API OpenAI-compatible. Sem cartão, sem Pix — só a chave, que fica criptografada e expira sozinha.
              </p>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-[#ECEFF4]">Seu nome</span>
                <input
                  className="w-full rounded-2xl border border-white/10 bg-[#071120] px-4 py-3 text-[#ECEFF4] outline-none transition focus:border-[#F5A623]"
                  value={registerForm.name}
                  onChange={(event) => setRegisterForm({ ...registerForm, name: event.target.value })}
                  minLength={2}
                  required
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-[#ECEFF4]">Empresa/marca</span>
                <input
                  className="w-full rounded-2xl border border-white/10 bg-[#071120] px-4 py-3 text-[#ECEFF4] outline-none transition focus:border-[#F5A623]"
                  value={registerForm.company}
                  onChange={(event) => setRegisterForm({ ...registerForm, company: event.target.value })}
                  minLength={2}
                  required
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-[#ECEFF4]">E-mail</span>
                <input
                  className="w-full rounded-2xl border border-white/10 bg-[#071120] px-4 py-3 text-[#ECEFF4] outline-none transition focus:border-[#F5A623]"
                  type="email"
                  value={registerForm.email}
                  onChange={(event) => setRegisterForm({ ...registerForm, email: event.target.value })}
                  required
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-[#ECEFF4]">Senha (mínimo 12 caracteres)</span>
                <input
                  className="w-full rounded-2xl border border-white/10 bg-[#071120] px-4 py-3 text-[#ECEFF4] outline-none transition focus:border-[#F5A623]"
                  type="password"
                  value={registerForm.password}
                  onChange={(event) => setRegisterForm({ ...registerForm, password: event.target.value })}
                  minLength={12}
                  required
                />
              </label>
              <button
                className="md:col-span-2 rounded-full bg-[#F5A623] px-6 py-4 font-black text-[#071120] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={isRegistering}
              >
                {isRegistering ? "Criando conta..." : "Começar meu teste de 14 dias"}
              </button>
            </form>
          )}
        </div>
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
              disabled={isSubmitting || hasActiveJobs}
            >
              {isSubmitting ? "Enviando..." : hasActiveJobs ? "Gerando pacote..." : "Executar pacote agora"}
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

          <form className="space-y-4 rounded-2xl border border-[#F5A623]/20 bg-[#0C1A2E] p-5" onSubmit={handleLlmCredentialSubmit}>
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#F5A623]">Teste de 14 dias</p>
              <h4 className="mt-2 text-xl font-black">Sua própria chave API</h4>
              <p className="mt-2 text-sm leading-6 text-[#D6D3C4]">
                Use sua própria chave API OpenAI-compatible durante o teste. A chave é criptografada, nunca aparece novamente na tela e vence automaticamente em 14 dias.
              </p>
              {llmCredential?.configured && (
                <p className="mt-3 rounded-2xl bg-[#071120] p-3 text-sm text-[#D6D3C4]">
                  Status: {llmCredential.trialActive ? "ativo" : "expirado"} · modelo {llmCredential.model} · chave {llmCredential.apiKeyPreview} · expira em {llmCredential.trialEndsAt ? new Date(llmCredential.trialEndsAt).toLocaleDateString("pt-BR") : "--"}
                </p>
              )}
            </div>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#ECEFF4]">Provider</span>
              <input className="w-full rounded-2xl border border-white/10 bg-[#071120] px-4 py-3 text-[#ECEFF4]" value={llmCredentialForm.provider} onChange={(event) => setLlmCredentialForm({ ...llmCredentialForm, provider: event.target.value })} required />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#ECEFF4]">Base URL</span>
              <input className="w-full rounded-2xl border border-white/10 bg-[#071120] px-4 py-3 text-[#ECEFF4]" value={llmCredentialForm.baseUrl} onChange={(event) => setLlmCredentialForm({ ...llmCredentialForm, baseUrl: event.target.value })} placeholder="https://api.openai.com/v1" required />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#ECEFF4]">Modelo</span>
              <input className="w-full rounded-2xl border border-white/10 bg-[#071120] px-4 py-3 text-[#ECEFF4]" value={llmCredentialForm.model} onChange={(event) => setLlmCredentialForm({ ...llmCredentialForm, model: event.target.value })} required />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#ECEFF4]">API key</span>
              <input className="w-full rounded-2xl border border-white/10 bg-[#071120] px-4 py-3 text-[#ECEFF4]" value={llmCredentialForm.apiKey} onChange={(event) => setLlmCredentialForm({ ...llmCredentialForm, apiKey: event.target.value })} type="password" required />
            </label>
            <div className="flex flex-wrap gap-3">
              <button className="rounded-full bg-[#F5A623] px-5 py-3 font-black text-[#071120]" type="submit">Ativar teste com minha chave</button>
              {llmCredential?.configured && <button className="rounded-full border border-white/20 px-5 py-3 font-bold text-[#D6D3C4]" type="button" onClick={handleDeleteLlmCredential}>Remover chave</button>}
            </div>
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
              <h4 className="text-lg font-bold">Assinatura</h4>
              {billing?.trial ? (
                <div className="mt-3 space-y-2 text-sm text-[#D6D3C4]">
                  <p>
                    Teste gratuito ativo até <b className="text-[#F5A623]">{new Date(billing.trial.trialEndsAt).toLocaleDateString("pt-BR")}</b> — geração com a sua própria chave API.
                  </p>
                  <p>
                    Para usar o LLM gerenciado pela Nutef e continuar depois do teste, assine pelo checkout Pix nesta página (use o mesmo e-mail e senha desta conta).
                  </p>
                </div>
              ) : subscription ? (
                <div className="mt-3 space-y-3 text-sm text-[#D6D3C4]">
                  <p>
                    Plano <b className="text-[#ECEFF4]">{subscription.plan}</b> · status{" "}
                    <b className="text-[#F5A623]">{SUBSCRIPTION_STATUS_LABELS[subscription.status] ?? subscription.status}</b>
                    {subscription.currentPeriodEnd && (
                      <> · {subscription.status === "ACTIVE" ? "pago até" : "venceu em"} {new Date(subscription.currentPeriodEnd).toLocaleDateString("pt-BR")}</>
                    )}
                  </p>
                  {subscription.cancelAtPeriodEnd && subscription.status === "ACTIVE" && (
                    <p className="rounded-xl bg-[#F5A623]/10 p-3 text-[#F5A623]">
                      Cancelamento agendado: o acesso termina no fim do período pago e nenhuma nova cobrança será gerada.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3">
                    {subscription.pendingInvoice?.paymentLinkUrl && (
                      <a className="rounded-full bg-[#F5A623] px-5 py-2 font-black text-[#071120]" href={subscription.pendingInvoice.paymentLinkUrl} target="_blank" rel="noreferrer">
                        Pagar cobrança pendente
                      </a>
                    )}
                    {subscriptionBlocked && !subscription.pendingInvoice && (
                      <button className="rounded-full bg-[#F5A623] px-5 py-2 font-black text-[#071120] disabled:opacity-60" type="button" disabled={isBillingAction} onClick={() => handleBillingAction("regenerate_invoice")}>
                        Gerar nova cobrança Pix
                      </button>
                    )}
                    {subscription.status === "ACTIVE" && !subscription.cancelAtPeriodEnd && (
                      <button className="rounded-full border border-white/20 px-5 py-2 font-bold text-[#D6D3C4] disabled:opacity-60" type="button" disabled={isBillingAction} onClick={() => handleBillingAction("cancel")}>
                        Cancelar assinatura
                      </button>
                    )}
                    {subscription.cancelAtPeriodEnd && subscription.status === "ACTIVE" && (
                      <button className="rounded-full border border-[#F5A623]/40 px-5 py-2 font-bold text-[#F5A623] disabled:opacity-60" type="button" disabled={isBillingAction} onClick={() => handleBillingAction("resume")}>
                        Manter assinatura
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-[#8FA3B8]">
                    Arrependimento em até 7 dias da primeira compra (art. 49 do CDC): escreva para contato@nutef.com e devolvemos o valor via Pix.
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-[#D6D3C4]">Conta sem assinatura self-service (plano gerenciado pela Nutef).</p>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0C1A2E] p-4">
              <h4 className="text-lg font-bold">Jobs recentes</h4>
              <div className="mt-4 space-y-3">
                {(payload?.jobs ?? []).slice(0, 4).map((job) => (
                  <div key={job.id} className="rounded-2xl border border-white/10 bg-[#142A42] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-bold">{job.briefing?.title ?? job.skill}</p>
                      <span className="flex items-center gap-2">
                        {job.output?.status === "fallback" && (
                          <span className="rounded-full bg-[#F5A623]/15 px-3 py-1 text-xs font-bold text-[#F5A623]">contingência</span>
                        )}
                        <span className={`rounded-full px-3 py-1 text-xs font-bold ${job.status === "FAILED" ? "bg-red-500/15 text-red-300" : "bg-[#2487D8]/15 text-[#7DC8F5]"}`}>
                          {JOB_STATUS_LABELS[job.status] ?? job.status}
                        </span>
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-[#D6D3C4]">{job.briefing?.objective}</p>
                    {job.status === "FAILED" && (
                      <p className="mt-2 text-sm text-red-300">Motivo: {friendlyJobError(job.error)}.</p>
                    )}
                    <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[#7DC8F5]">
                      {job.usageLedger?.[0]?.provider ?? "aguardando geração"} · {job.usageLedger?.[0]?.outputTokens ?? 0} tokens saída
                    </p>
                  </div>
                ))}
                {!payload?.jobs.length && <p className="text-sm text-[#D6D3C4]">Nenhum job criado ainda.</p>}
              </div>
            </div>

            <div className="rounded-2xl border border-[#F5A623]/20 bg-[#F5A623]/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h4 className="text-lg font-bold text-[#F5A623]">Artifact gerado</h4>
                {latestArtifact && (
                  <button
                    className="rounded-full bg-[#0A66C2] px-4 py-2 text-sm font-black text-white disabled:opacity-60"
                    type="button"
                    onClick={openPublishEditor}
                  >
                    Publicar no LinkedIn
                  </button>
                )}
              </div>
              <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-[#071120]/80 p-4 text-sm leading-6 text-[#F9E6BC]">
                {latestArtifact?.content ??
                  (hasActiveJobs
                    ? "Gerando o pacote... o resultado aparece aqui sozinho."
                    : latestJob?.status === "FAILED"
                      ? `A última geração falhou: ${friendlyJobError(latestJob.error)}.`
                      : "Crie um pacote para visualizar o markdown persistido.")}
              </pre>

              {publishOpen && (
                <form className="mt-4 rounded-xl border border-[#0A66C2]/40 bg-[#071120] p-4" onSubmit={handlePublish}>
                  <p className="text-sm font-bold text-[#7DC8F5]">Revisar e publicar no LinkedIn</p>
                  {!linkedinConnected ? (
                    <div className="mt-3 space-y-3">
                      <p className="text-sm text-[#D6D3C4]">Conecte seu LinkedIn para publicar. Você revisa e aprova cada post — nada é publicado sozinho.</p>
                      <button className="rounded-full bg-[#0A66C2] px-5 py-2 text-sm font-black text-white" type="button" onClick={handleConnectLinkedIn}>
                        Conectar LinkedIn
                      </button>
                    </div>
                  ) : (
                    <>
                      <textarea
                        className="mt-3 min-h-40 w-full rounded-xl border border-white/10 bg-[#0C1A2E] px-4 py-3 text-sm leading-6 text-[#ECEFF4] outline-none focus:border-[#0A66C2]"
                        value={publishText}
                        onChange={(event) => setPublishText(event.target.value)}
                        maxLength={3000}
                        required
                      />
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-[#8FA3B8]">{publishText.length}/3000 · publica no perfil de {social?.connection.displayName ?? "você"}</span>
                        <div className="flex gap-2">
                          <button className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold text-[#D6D3C4]" type="button" onClick={() => setPublishOpen(false)}>
                            Cancelar
                          </button>
                          <button className="rounded-full bg-[#0A66C2] px-5 py-2 text-sm font-black text-white disabled:opacity-60" type="submit" disabled={isPublishing || !publishText.trim()}>
                            {isPublishing ? "Publicando..." : "Publicar agora"}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </form>
              )}
            </div>

            <div className="rounded-2xl border border-[#0A66C2]/30 bg-[#0C1A2E] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h4 className="text-lg font-bold text-[#7DC8F5]">Redes sociais</h4>
                {social && social.configured && (
                  linkedinConnected ? (
                    <button className="rounded-full border border-white/20 px-4 py-2 text-sm font-bold text-[#D6D3C4]" type="button" onClick={handleDisconnectLinkedIn}>
                      Desconectar
                    </button>
                  ) : (
                    <button className="rounded-full bg-[#0A66C2] px-4 py-2 text-sm font-black text-white" type="button" onClick={handleConnectLinkedIn}>
                      Conectar LinkedIn
                    </button>
                  )
                )}
              </div>
              {social && !social.configured && (
                <p className="mt-2 text-sm text-[#D6D3C4]">Publicação no LinkedIn ainda não habilitada nesta instância.</p>
              )}
              {social?.configured && (
                <p className="mt-2 text-sm text-[#D6D3C4]">
                  {linkedinConnected ? (
                    <>
                      Conectado como <b className="text-[#ECEFF4]">{social.connection.displayName ?? "membro"}</b>
                      {social.connection.tokenExpiresAt && (
                        <> · válido até {new Date(social.connection.tokenExpiresAt).toLocaleDateString("pt-BR")}</>
                      )}
                      {social.connection.expiringSoon && <span className="text-[#F5A623]"> · expira em breve, reconecte</span>}
                    </>
                  ) : social.connection.status === "EXPIRED" ? (
                    "Sua conexão expirou. Reconecte para voltar a publicar."
                  ) : (
                    "Conecte seu LinkedIn para publicar os posts gerados. Cada publicação passa pela sua aprovação."
                  )}
                </p>
              )}
              {publications.length > 0 && (
                <div className="mt-4 space-y-2">
                  {publications.slice(0, 4).map((pub) => (
                    <div key={pub.id} className="rounded-xl border border-white/10 bg-[#142A42] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-bold ${pub.status === "FAILED" ? "bg-red-500/15 text-red-300" : pub.status === "PUBLISHED" ? "bg-emerald-500/15 text-emerald-300" : "bg-[#2487D8]/15 text-[#7DC8F5]"}`}>
                          {PUBLICATION_STATUS_LABELS[pub.status] ?? pub.status}
                        </span>
                        {pub.externalUrl && pub.status === "PUBLISHED" && (
                          <a className="text-xs font-bold text-[#7DC8F5] underline" href={pub.externalUrl} target="_blank" rel="noreferrer">ver no LinkedIn</a>
                        )}
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm text-[#D6D3C4]">{pub.commentary}</p>
                      {pub.status === "FAILED" && pub.error && (
                        <p className="mt-1 text-xs text-red-300">{PUBLICATION_ERROR_MESSAGES[pub.error] ?? pub.error}</p>
                      )}
                    </div>
                  ))}
                  {hasPendingPub && <p className="text-xs text-[#8FA3B8]">Publicações na fila são processadas pelo worker em instantes.</p>}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-red-500/20 bg-[#0C1A2E] p-4">
              <h4 className="text-lg font-bold text-red-300">Excluir conta</h4>
              <p className="mt-2 text-sm text-[#D6D3C4]">
                Remove sua conta e todos os dados do tenant (voz da marca, briefings, jobs, artifacts). Ação irreversível.
              </p>
              {!showDeleteConfirm ? (
                <button className="mt-3 rounded-full border border-red-400/40 px-5 py-2 text-sm font-bold text-red-300" type="button" onClick={() => setShowDeleteConfirm(true)}>
                  Quero excluir minha conta
                </button>
              ) : (
                <form className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end" onSubmit={handleDeleteAccount}>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-[#ECEFF4]">Confirme sua senha</span>
                    <input
                      className="w-full rounded-2xl border border-white/10 bg-[#071120] px-4 py-3 text-[#ECEFF4]"
                      type="password"
                      value={deletePassword}
                      onChange={(event) => setDeletePassword(event.target.value)}
                      minLength={8}
                      required
                    />
                  </label>
                  <button className="rounded-full bg-red-500 px-5 py-3 font-black text-white disabled:opacity-60" type="submit" disabled={isDeleting}>
                    {isDeleting ? "Excluindo..." : "Excluir definitivamente"}
                  </button>
                  <button className="rounded-full border border-white/20 px-5 py-3 font-bold text-[#D6D3C4]" type="button" onClick={() => setShowDeleteConfirm(false)}>
                    Voltar
                  </button>
                </form>
              )}
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
