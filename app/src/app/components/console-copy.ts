// Textos e helpers compartilhados entre o card de acesso (landing) e o painel (/painel).
// Linguagem do usuário — nada de "tenant"/"job"/"artifact".

export const API_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "E-mail ou senha incorretos.",
  invalid_input: "Dados inválidos — confira os campos preenchidos.",
  rate_limited: "Muitas tentativas em sequência. Aguarde alguns minutos e tente de novo.",
  auth_required: "Sua sessão expirou. Entre novamente.",
  quota_exceeded: "O limite mensal de conteúdo do seu plano acabou. Ele renova no próximo mês ou com upgrade de plano.",
  job_input_token_limit_exceeded: "O briefing está longo demais para uma geração. Resuma o contexto e tente de novo.",
  monthly_quota_exceeded: "O limite mensal de conteúdo do seu plano acabou.",
  billing_blocked: "Sua assinatura está pendente ou vencida. Regularize o pagamento para continuar gerando.",
  trial_requires_byok: "No teste de 14 dias, cadastre sua chave de API (em Conta) antes de gerar conteúdo.",
  trial_expired: "Seu teste de 14 dias terminou. Assine um plano para continuar usando o Cortex.",
  email_already_registered: "Este e-mail já tem conta. Entre ou use \"Esqueci minha senha\".",
  email_or_company_already_exists: "Este e-mail já tem conta. Para retomar uma compra, use a mesma senha da conta.",
  tenant_already_subscribed: "Esta conta já tem assinatura ativa. Escreva para contato@nutef.com para mudar de plano.",
  no_active_subscription: "Não há assinatura ativa nesta conta.",
  woovi_not_configured: "Pagamentos indisponíveis no momento. Tente novamente em instantes.",
  not_connected: "Conecte seu LinkedIn antes de publicar.",
  connection_expired: "Sua conexão do LinkedIn expirou — reconecte para publicar.",
};

export const GENERATION_STATUS_LABELS: Record<string, string> = {
  PENDING: "Na fila",
  PROCESSING: "Gerando",
  COMPLETED: "Pronto",
  FAILED: "Falhou",
  CANCELLED: "Cancelado",
};

export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  PENDING: "Aguardando pagamento",
  ACTIVE: "Ativa",
  PAST_DUE: "Vencida",
  CANCELED: "Cancelada",
  INCOMPLETE: "Incompleta",
};

export const PUBLICATION_STATUS_LABELS: Record<string, string> = {
  PENDING: "Na fila",
  PUBLISHING: "Publicando",
  PUBLISHED: "Publicado",
  FAILED: "Falhou",
  CANCELLED: "Cancelado",
};

export const SOCIAL_QUERY_MESSAGES: Record<string, string> = {
  linkedin_conectado: "LinkedIn conectado com sucesso.",
  linkedin_erro: "Não foi possível conectar o LinkedIn. Tente novamente.",
  linkedin_negado: "Conexão com o LinkedIn cancelada.",
};

const PUBLICATION_ERROR_MESSAGES: Record<string, string> = {
  conexao_expirada_reconecte: "a conexão do LinkedIn expirou — reconecte para publicar",
  permissao_negada_linkedin: "o LinkedIn recusou a permissão de publicação",
  worker_interrompido_sem_tentativas: "o processamento foi interrompido",
};

export function publicationError(error?: string | null) {
  if (!error) return "erro não informado";
  return PUBLICATION_ERROR_MESSAGES[error] ?? error;
}

export function friendlyApiError(payload: { error?: string } | null, httpStatus: number, fallback: string) {
  const slug = payload?.error;
  if (slug && API_ERROR_MESSAGES[slug]) {
    return API_ERROR_MESSAGES[slug];
  }
  if (httpStatus === 429) {
    return API_ERROR_MESSAGES.rate_limited;
  }
  return `${fallback} (erro ${slug ?? httpStatus}).`;
}

export function friendlyGenerationError(error?: string | null) {
  if (!error) return "erro não informado";
  if (error.includes("http_401") || error.includes("http_403")) return "a chave de API foi recusada pelo provedor — confira a chave cadastrada";
  if (error.includes("timeout")) return "a IA demorou demais para responder";
  if (error.includes("empty_openai_compatible")) return "a IA devolveu uma resposta vazia";
  if (error.startsWith("openai_compatible_http_")) return `a IA respondeu com erro (${error.replace("openai_compatible_http_", "HTTP ")})`;
  if (error.startsWith("worker_interrompido")) return "o processamento foi interrompido no meio";
  return error;
}

// Extrai a seção "Post LinkedIn" do pacote em Markdown para pré-preencher o editor.
export function extractLinkedInSection(markdown: string): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => /^#{1,3}\s+.*linkedin/i.test(l));
  if (start === -1) return markdown.trim();
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#{1,3}\s+/.test(l));
  const body = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
  return body || markdown.trim();
}
