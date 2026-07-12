import { readSecretEnv } from "./runtime-config";

// Cliente da API do Instagram (Instagram Platform "API with Instagram Login").
// Doc oficial (developers.facebook.com/docs/instagram-platform):
// - OAuth direto na conta IG profissional (Business/Creator), SEM Página do Facebook.
// - Publicação em 2 passos: criar container (/{ig-id}/media com image_url público +
//   caption) → publicar (/{ig-id}/media_publish com creation_id).
// - A imagem PRECISA estar numa URL pública (a Meta faz cURL nela). Só JPEG no feed.
// - Token long-lived de 60 dias, refreshável (melhor que o self-serve do LinkedIn).

const AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
const TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const GRAPH = "https://graph.instagram.com";
const GRAPH_VERSION = "v23.0";
export const INSTAGRAM_SCOPES = ["instagram_business_basic", "instagram_business_content_publish"];
export const IG_LONG_TOKEN_TTL_SECONDS = 60 * 24 * 60 * 60; // 60 dias
// Só JPEG no feed do Instagram (doc: "JPEG is the only image format supported").
export const IG_ALLOWED_IMAGE_TYPES = ["image/jpeg"];
// Limite de imagem do feed do Instagram: 8 MB.
export const IG_MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export class InstagramApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly reason: "token_expired" | "forbidden" | "rate_limited" | "bad_request" | "server_error",
    message: string,
  ) {
    super(message);
    this.name = "InstagramApiError";
  }
}

function getClientId() {
  const v = readSecretEnv("INSTAGRAM_CLIENT_ID");
  if (!v) throw new InstagramApiError(503, "server_error", "instagram_client_id_missing");
  return v;
}
function getClientSecret() {
  const v = readSecretEnv("INSTAGRAM_CLIENT_SECRET");
  if (!v) throw new InstagramApiError(503, "server_error", "instagram_client_secret_missing");
  return v;
}

export function getInstagramRedirectUri() {
  const base = process.env.CORTEX_PUBLIC_URL ?? "https://cortex.nutef.com";
  return process.env.INSTAGRAM_REDIRECT_URI ?? `${base}/api/social/instagram/callback`;
}

export function isInstagramConfigured() {
  return Boolean(readSecretEnv("INSTAGRAM_CLIENT_ID") && readSecretEnv("INSTAGRAM_CLIENT_SECRET"));
}

export function buildInstagramAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getInstagramRedirectUri(),
    response_type: "code",
    scope: INSTAGRAM_SCOPES.join(","),
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export type InstagramToken = {
  accessToken: string;
  userId: string;
  expiresInSeconds: number;
};

// Troca o code por token curto e já converte para long-lived (60 dias).
export async function exchangeInstagramCode(code: string): Promise<InstagramToken> {
  const body = new URLSearchParams({
    client_id: getClientId(),
    client_secret: getClientSecret(),
    grant_type: "authorization_code",
    redirect_uri: getInstagramRedirectUri(),
    code,
  });
  const shortRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!shortRes.ok) {
    throw mapError(shortRes.status, await shortRes.text().catch(() => ""));
  }
  const short = (await shortRes.json()) as { access_token?: string; user_id?: number | string };
  if (!short.access_token || short.user_id === undefined) {
    throw new InstagramApiError(502, "server_error", "ig_token_response_incomplete");
  }

  // Curto → long-lived (60 dias).
  const longUrl = `${GRAPH}/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(getClientSecret())}&access_token=${encodeURIComponent(short.access_token)}`;
  const longRes = await fetch(longUrl);
  if (!longRes.ok) {
    throw mapError(longRes.status, await longRes.text().catch(() => ""));
  }
  const long = (await longRes.json()) as { access_token?: string; expires_in?: number };
  return {
    accessToken: long.access_token ?? short.access_token,
    userId: String(short.user_id),
    expiresInSeconds: long.expires_in ?? IG_LONG_TOKEN_TTL_SECONDS,
  };
}

// Renova o token long-lived (precisa ter ≥24h e <60d de idade).
export async function refreshInstagramToken(accessToken: string): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const url = `${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw mapError(res.status, await res.text().catch(() => ""));
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new InstagramApiError(502, "server_error", "ig_refresh_incomplete");
  return { accessToken: json.access_token, expiresInSeconds: json.expires_in ?? IG_LONG_TOKEN_TTL_SECONDS };
}

export async function fetchInstagramUsername(accessToken: string, _userId: string): Promise<string | null> {
  // A doc do Instagram Login usa /me (o id retornado no token é app-scoped e não
  // resolve direto como nó). O username vira o displayName da conexão.
  const url = `${GRAPH}/${GRAPH_VERSION}/me?fields=username&access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = (await res.json()) as { username?: string };
  return json.username ?? null;
}

export type InstagramPostResult = { mediaId: string; url: string };

// Publica uma imagem única no feed: cria o container (image_url público + caption)
// e publica. `imageUrl` tem de ser acessível publicamente por HTTPS (a Meta faz cURL).
export async function createImagePost(accessToken: string, igUserId: string, imageUrl: string, caption: string): Promise<InstagramPostResult> {
  // 1) container
  const createUrl = `${GRAPH}/${GRAPH_VERSION}/${igUserId}/media`;
  const createRes = await fetch(createUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ image_url: imageUrl, caption, access_token: accessToken }).toString(),
  });
  if (!createRes.ok) {
    throw mapError(createRes.status, await createRes.text().catch(() => ""));
  }
  const container = (await createRes.json()) as { id?: string };
  if (!container.id) throw new InstagramApiError(502, "server_error", "ig_container_missing_id");

  // 2) publish
  const publishUrl = `${GRAPH}/${GRAPH_VERSION}/${igUserId}/media_publish`;
  const publishRes = await fetch(publishUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: container.id, access_token: accessToken }).toString(),
  });
  if (!publishRes.ok) {
    throw mapError(publishRes.status, await publishRes.text().catch(() => ""));
  }
  const published = (await publishRes.json()) as { id?: string };
  const mediaId = published.id ?? "";
  return { mediaId, url: `https://www.instagram.com/` };
}

function mapError(status: number, text: string) {
  const detail = text.slice(0, 300);
  let code: number | undefined;
  try {
    code = (JSON.parse(text) as { error?: { code?: number } }).error?.code;
  } catch {
    // corpo não-JSON
  }
  if (status === 401 || code === 190) return new InstagramApiError(401, "token_expired", `ig_unauthorized:${detail}`);
  if (status === 403 || code === 10 || code === 200) return new InstagramApiError(403, "forbidden", `ig_forbidden:${detail}`);
  if (status === 429 || code === 4 || code === 17 || code === 32 || code === 613) return new InstagramApiError(429, "rate_limited", `ig_rate_limited:${detail}`);
  if (status >= 500) return new InstagramApiError(status, "server_error", `ig_server_error:${detail}`);
  return new InstagramApiError(status, "bad_request", `ig_bad_request:${detail}`);
}
