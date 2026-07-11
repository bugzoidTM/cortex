import { readSecretEnv } from "./runtime-config";

// Cliente da API do LinkedIn para publicação em nome do membro (perfil pessoal).
// Doc oficial (learn.microsoft.com/linkedin): OAuth 3-legged self-serve com os produtos
// "Sign In with LinkedIn using OpenID Connect" (openid/profile/email) e "Share on
// LinkedIn" (w_member_social). Access token dura 60 dias; NÃO há refresh no self-serve.
// Publicação pela Posts API (POST /rest/posts), que substitui ugcPosts/shares.

const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const POSTS_URL = "https://api.linkedin.com/rest/posts";
const IMAGES_INIT_URL = "https://api.linkedin.com/rest/images?action=initializeUpload";
// Formatos aceitos pela Images API do LinkedIn (doc: JPG, GIF, PNG; <36.152.320 px).
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif"];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB (cap conservador)
// Versão da Posts API (formato AAAAMM). Revisar periodicamente — o LinkedIn descontinua
// versões antigas (foi assim que a ugcPosts morreu).
const LINKEDIN_VERSION = "202606";
export const LINKEDIN_SCOPES = ["openid", "profile", "email", "w_member_social"];
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 24 * 60 * 60; // 60 dias

export class LinkedInApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly reason: "token_expired" | "forbidden" | "rate_limited" | "bad_request" | "server_error" | "network",
    message: string,
  ) {
    super(message);
    this.name = "LinkedInApiError";
  }
}

function getClientId() {
  const value = readSecretEnv("LINKEDIN_CLIENT_ID");
  if (!value) throw new LinkedInApiError(503, "server_error", "linkedin_client_id_missing");
  return value;
}

function getClientSecret() {
  const value = readSecretEnv("LINKEDIN_CLIENT_SECRET");
  if (!value) throw new LinkedInApiError(503, "server_error", "linkedin_client_secret_missing");
  return value;
}

export function getRedirectUri() {
  const base = process.env.CORTEX_PUBLIC_URL ?? "https://cortex.nutef.com";
  return process.env.LINKEDIN_REDIRECT_URI ?? `${base}/api/social/linkedin/callback`;
}

export function isLinkedInConfigured() {
  return Boolean(readSecretEnv("LINKEDIN_CLIENT_ID") && readSecretEnv("LINKEDIN_CLIENT_SECRET"));
}

export function buildAuthorizationUrl(state: string) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    scope: LINKEDIN_SCOPES.join(" "),
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export type LinkedInToken = {
  accessToken: string;
  expiresInSeconds: number;
  scope: string;
};

export async function exchangeCodeForToken(code: string): Promise<LinkedInToken> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: getClientId(),
    client_secret: getClientSecret(),
    redirect_uri: getRedirectUri(),
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new LinkedInApiError(response.status, response.status === 400 ? "bad_request" : "server_error", `token_exchange_failed:${text.slice(0, 200)}`);
  }

  const json = (await response.json()) as { access_token?: string; expires_in?: number; scope?: string };
  if (!json.access_token) {
    throw new LinkedInApiError(502, "server_error", "token_response_missing_access_token");
  }
  return {
    accessToken: json.access_token,
    expiresInSeconds: json.expires_in ?? ACCESS_TOKEN_TTL_SECONDS,
    scope: json.scope ?? LINKEDIN_SCOPES.join(" "),
  };
}

export type LinkedInUserInfo = {
  sub: string;
  name?: string;
  email?: string;
  personUrn: string;
};

export async function fetchUserInfo(accessToken: string): Promise<LinkedInUserInfo> {
  const response = await fetch(USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw mapApiError(response.status, await response.text().catch(() => ""));
  }

  const json = (await response.json()) as { sub?: string; name?: string; email?: string };
  if (!json.sub) {
    throw new LinkedInApiError(502, "server_error", "userinfo_missing_sub");
  }
  return { sub: json.sub, name: json.name, email: json.email, personUrn: `urn:li:person:${json.sub}` };
}

// Faz upload de uma imagem à Images API e devolve o URN (urn:li:image:...) para
// referenciar no post. Fluxo (doc oficial): initializeUpload → PUT do binário no
// uploadUrl com o Bearer token. Não pollamos status: com w_member_social não dá GET
// em /rest/images (write-only), e a imagem fica pronta rápido; o post vem depois.
export async function uploadImage(accessToken: string, ownerUrn: string, bytes: ArrayBuffer, contentType: string): Promise<string> {
  const initResponse = await fetch(IMAGES_INIT_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({ initializeUploadRequest: { owner: ownerUrn } }),
  });

  if (!initResponse.ok) {
    throw mapApiError(initResponse.status, await initResponse.text().catch(() => ""));
  }

  const init = (await initResponse.json()) as { value?: { uploadUrl?: string; image?: string } };
  const uploadUrl = init.value?.uploadUrl;
  const imageUrn = init.value?.image;
  if (!uploadUrl || !imageUrn) {
    throw new LinkedInApiError(502, "server_error", "image_init_missing_upload_url");
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": contentType },
    body: bytes,
  });

  // O upload de imagem retorna 201 (ver doc); aceitamos qualquer 2xx.
  if (!uploadResponse.ok) {
    throw mapApiError(uploadResponse.status, await uploadResponse.text().catch(() => ""));
  }

  return imageUrn;
}

export type CreatePostResult = {
  postUrn: string;
  url: string;
};

// Publica um post no feed do membro (`authorUrn` = urn:li:person:{id}).
// Com `media`, anexa a imagem já enviada (content.media.id = urn:li:image:...).
export async function createMemberPost(
  accessToken: string,
  authorUrn: string,
  commentary: string,
  media?: { imageUrn: string; altText?: string },
): Promise<CreatePostResult> {
  const body: Record<string, unknown> = {
    author: authorUrn,
    commentary,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  if (media?.imageUrn) {
    body.content = { media: { id: media.imageUrn, altText: (media.altText ?? "").slice(0, 4000) } };
  }

  const response = await fetch(POSTS_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });

  if (response.status !== 201) {
    throw mapApiError(response.status, await response.text().catch(() => ""));
  }

  const postUrn = response.headers.get("x-restli-id") ?? "";
  return {
    postUrn,
    url: postUrn ? `https://www.linkedin.com/feed/update/${postUrn}` : "https://www.linkedin.com/feed/",
  };
}

function mapApiError(status: number, text: string) {
  const detail = text.slice(0, 200);
  if (status === 401) return new LinkedInApiError(401, "token_expired", `linkedin_unauthorized:${detail}`);
  if (status === 403) return new LinkedInApiError(403, "forbidden", `linkedin_forbidden:${detail}`);
  if (status === 429) return new LinkedInApiError(429, "rate_limited", `linkedin_rate_limited:${detail}`);
  if (status >= 500) return new LinkedInApiError(status, "server_error", `linkedin_server_error:${detail}`);
  return new LinkedInApiError(status, "bad_request", `linkedin_bad_request:${detail}`);
}
