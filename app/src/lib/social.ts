import { z } from "zod";
import { notifyAlert } from "./alerts";
import { decryptSecret, encryptSecret } from "./crypto";
import { sendTransactionalEmail } from "./email";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  createMemberPost,
  fetchUserInfo,
  isLinkedInConfigured,
  LinkedInApiError,
  LinkedInToken,
  uploadImage,
} from "./linkedin";
import {
  createImagePost,
  fetchInstagramProfile,
  IG_LONG_TOKEN_TTL_SECONDS,
  InstagramApiError,
  InstagramToken,
  isInstagramConfigured,
  refreshInstagramToken,
} from "./instagram";
import { getMediaAsset, publicMediaUrl } from "./media";
import { prisma } from "./prisma";

export type Platform = "linkedin" | "instagram";

const MAX_PUBLISH_ATTEMPTS = 3;
// Publicação presa em PUBLISHING além disso é órfã de um worker que morreu no meio.
const STALE_PUBLICATION_MINUTES = 15;
// LinkedIn não dá refresh no self-serve → avisamos para reconectar antes de expirar.
const EXPIRY_WARNING_DAYS = 7;
// Instagram tem refresh (token de 60d): renovamos quando faltam ≤15 dias.
const IG_REFRESH_WHEN_DAYS_LEFT = 15;
const DAY_MS = 24 * 60 * 60 * 1000;
// Agendamento: no máximo 30 dias à frente (evita fila parada indefinidamente).
const MAX_SCHEDULE_DAYS = 30;
// Legenda: LinkedIn ~3000, Instagram ~2200.
const IG_CAPTION_MAX = 2200;

export const createPublicationSchema = z
  .object({
    platform: z.enum(["linkedin", "instagram"]).default("linkedin"),
    commentary: z.string().min(1).max(3000),
    artifactId: z.string().min(1).optional(),
    // Imagem (anexada ou gerada por IA) hospedada como MediaAsset. Vale para as duas
    // redes: no LinkedIn o worker faz upload do binário; no Instagram serve a URL pública.
    mediaAssetId: z.string().min(1).optional(),
    // ISO datetime; publicar na hora marcada (futuro, ≤30d). Ausente = publicar já.
    scheduledFor: z
      .string()
      .datetime()
      .optional()
      .refine((v) => {
        if (!v) return true;
        const t = new Date(v).getTime();
        const now = Date.now();
        return t > now + 60_000 && t <= now + MAX_SCHEDULE_DAYS * DAY_MS;
      }, "scheduledFor precisa estar entre ~1 min e 30 dias no futuro"),
  })
  .refine((d) => d.platform !== "instagram" || Boolean(d.mediaAssetId), { message: "instagram_requer_imagem", path: ["mediaAssetId"] })
  .refine((d) => d.platform !== "instagram" || d.commentary.length <= IG_CAPTION_MAX, { message: "instagram_legenda_longa", path: ["commentary"] });

export class PublicationBlockedError extends Error {
  constructor(public readonly reason: "not_connected" | "connection_expired") {
    super(reason);
    this.name = "PublicationBlockedError";
  }
}

export type PublicSocialConnection = {
  platform: Platform;
  configured: boolean;
  connected: boolean;
  displayName: string | null;
  status: string | null;
  tokenExpiresAt: Date | null;
  expiringSoon: boolean;
};

// Deriva o status vivo: um token vencido é EXPIRED mesmo que o banco ainda diga ACTIVE.
function liveStatus(stored: string, tokenExpiresAt: Date) {
  if (stored === "ACTIVE" && tokenExpiresAt <= new Date()) return "EXPIRED";
  return stored;
}

function isConfigured(platform: Platform) {
  return platform === "instagram" ? isInstagramConfigured() : isLinkedInConfigured();
}

async function connectionStatus(tenantId: string, platform: Platform): Promise<PublicSocialConnection> {
  const connection = await prisma.socialConnection.findUnique({ where: { tenantId_platform: { tenantId, platform } } });
  if (!connection) {
    return { platform, configured: isConfigured(platform), connected: false, displayName: null, status: null, tokenExpiresAt: null, expiringSoon: false };
  }
  const live = liveStatus(connection.status, connection.tokenExpiresAt);
  return {
    platform,
    configured: isConfigured(platform),
    connected: live === "ACTIVE",
    displayName: connection.displayName,
    status: live,
    tokenExpiresAt: connection.tokenExpiresAt,
    expiringSoon: live === "ACTIVE" && connection.tokenExpiresAt.getTime() - Date.now() < EXPIRY_WARNING_DAYS * DAY_MS,
  };
}

// Estado de todas as plataformas para o painel.
export async function getSocialOverview(tenantId: string) {
  const [linkedin, instagram] = await Promise.all([connectionStatus(tenantId, "linkedin"), connectionStatus(tenantId, "instagram")]);
  return { linkedin, instagram };
}

export async function saveLinkedInConnection(tenantId: string, userId: string, token: LinkedInToken) {
  const info = await fetchUserInfo(token.accessToken);
  const tokenExpiresAt = new Date(Date.now() + (token.expiresInSeconds || ACCESS_TOKEN_TTL_SECONDS) * 1000);
  await upsertConnection(tenantId, "linkedin", {
    externalId: info.sub,
    externalUrn: info.personUrn,
    displayName: info.name ?? null,
    scopes: token.scope.split(" ").filter(Boolean),
    accessToken: token.accessToken,
    tokenExpiresAt,
    userId,
  });
  return { displayName: info.name ?? null };
}

export async function saveInstagramConnection(tenantId: string, userId: string, token: InstagramToken) {
  // O id do token é app-scoped; o /me traz o id REAL da conta profissional (o que
  // a API de publicação aceita) e o username.
  const profile = await fetchInstagramProfile(token.accessToken).catch(() => ({ userId: null, username: null }));
  const igUserId = profile.userId ?? token.userId;
  const tokenExpiresAt = new Date(Date.now() + (token.expiresInSeconds || IG_LONG_TOKEN_TTL_SECONDS) * 1000);
  await upsertConnection(tenantId, "instagram", {
    externalId: igUserId,
    externalUrn: igUserId,
    displayName: profile.username,
    scopes: ["instagram_business_basic", "instagram_business_content_publish"],
    accessToken: token.accessToken,
    tokenExpiresAt,
    userId,
  });
  return { displayName: profile.username };
}

async function upsertConnection(
  tenantId: string,
  platform: Platform,
  data: { externalId: string; externalUrn: string; displayName: string | null; scopes: string[]; accessToken: string; tokenExpiresAt: Date; userId: string },
) {
  const common = {
    externalId: data.externalId,
    externalUrn: data.externalUrn,
    displayName: data.displayName,
    scopes: data.scopes,
    encryptedToken: encryptSecret(data.accessToken),
    tokenExpiresAt: data.tokenExpiresAt,
    status: "ACTIVE" as const,
    expiryNoticeSentAt: null,
  };
  await prisma.socialConnection.upsert({
    where: { tenantId_platform: { tenantId, platform } },
    update: common,
    create: { tenantId, platform, connectedByUserId: data.userId, ...common },
  });
}

export async function disconnectSocial(tenantId: string, platform: Platform) {
  await prisma.socialConnection.deleteMany({ where: { tenantId, platform } });
  return connectionStatus(tenantId, platform);
}

async function requireActiveConnection(tenantId: string, platform: Platform) {
  const connection = await prisma.socialConnection.findUnique({ where: { tenantId_platform: { tenantId, platform } } });
  if (!connection) throw new PublicationBlockedError("not_connected");
  if (liveStatus(connection.status, connection.tokenExpiresAt) !== "ACTIVE") throw new PublicationBlockedError("connection_expired");
  return connection;
}

// Enfileira uma publicação. O texto é o final que o usuário revisou e aprovou (ação
// explícita); nada é postado sozinho. Instagram exige uma imagem (mediaAssetId).
export async function enqueuePublication(tenantId: string, input: unknown) {
  const parsed = createPublicationSchema.parse(input);
  const platform = parsed.platform as Platform;
  const connection = await requireActiveConnection(tenantId, platform);

  // A imagem hospedada (Instagram/IA) precisa pertencer ao tenant.
  if (parsed.mediaAssetId) {
    const owned = await prisma.mediaAsset.findFirst({ where: { id: parsed.mediaAssetId, tenantId }, select: { id: true } });
    if (!owned) throw new PublicationBlockedError("not_connected");
  }

  return prisma.publication.create({
    data: {
      tenantId,
      connectionId: connection.id,
      artifactId: parsed.artifactId ?? null,
      platform,
      authorUrn: connection.externalUrn,
      commentary: parsed.commentary,
      mediaImageUrns: [],
      mediaAssetId: parsed.mediaAssetId ?? null,
      scheduledFor: parsed.scheduledFor ? new Date(parsed.scheduledFor) : null,
      status: "PENDING",
    },
  });
}

export async function cancelPublication(tenantId: string, publicationId: string) {
  const result = await prisma.publication.updateMany({
    where: { id: publicationId, tenantId, status: "PENDING" },
    data: { status: "CANCELLED", error: null },
  });
  return result.count === 1;
}

export async function listPublications(tenantId: string, take = 10) {
  return prisma.publication.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      platform: true,
      commentary: true,
      status: true,
      externalUrl: true,
      error: true,
      mediaImageUrns: true,
      mediaAssetId: true,
      scheduledFor: true,
      publishedAt: true,
      createdAt: true,
    },
  });
}

// --- Processamento pelo worker ---

export async function reclaimStalePublications(now = new Date()) {
  const staleBefore = new Date(now.getTime() - STALE_PUBLICATION_MINUTES * 60 * 1000);
  const requeued = await prisma.publication.updateMany({
    where: { status: "PUBLISHING", lockedAt: { lt: staleBefore }, attempts: { lt: MAX_PUBLISH_ATTEMPTS } },
    data: { status: "PENDING", lockedAt: null, error: "worker_interrompido_reprocessando" },
  });
  const failed = await prisma.publication.updateMany({
    where: { status: "PUBLISHING", lockedAt: { lt: staleBefore }, attempts: { gte: MAX_PUBLISH_ATTEMPTS } },
    data: { status: "FAILED", lockedAt: null, error: "worker_interrompido_sem_tentativas" },
  });
  return { requeued: requeued.count, failed: failed.count };
}

export async function processNextPublication() {
  const publication = await prisma.publication.findFirst({
    where: { status: "PENDING", attempts: { lt: MAX_PUBLISH_ATTEMPTS }, OR: [{ scheduledFor: null }, { scheduledFor: { lte: new Date() } }] },
    orderBy: { createdAt: "asc" },
  });
  if (!publication) return null;

  const claimed = await prisma.publication.updateMany({
    where: { id: publication.id, status: "PENDING" },
    data: { status: "PUBLISHING", lockedAt: new Date(), attempts: { increment: 1 }, error: null },
  });
  if (claimed.count !== 1) return null;

  const connection = await prisma.socialConnection.findUnique({ where: { id: publication.connectionId } });
  if (!connection || liveStatus(connection.status, connection.tokenExpiresAt) !== "ACTIVE") {
    await prisma.publication.update({ where: { id: publication.id }, data: { status: "FAILED", lockedAt: null, error: "conexao_expirada_reconecte" } });
    return { id: publication.id, status: "FAILED" as const };
  }

  try {
    const accessToken = decryptSecret(connection.encryptedToken);
    let externalPostUrn = "";
    let externalUrl = "";

    if (connection.platform === "instagram") {
      if (!publication.mediaAssetId) throw new Error("instagram_sem_imagem");
      const imageUrl = publicMediaUrl(publication.mediaAssetId);
      const result = await createImagePost(accessToken, connection.externalId, imageUrl, publication.commentary);
      externalPostUrn = result.mediaId;
      externalUrl = result.url;
    } else {
      // LinkedIn: se houver imagem, faz upload do binário agora e usa o URN no post.
      let media: { imageUrn: string; altText: string } | undefined;
      if (publication.mediaAssetId) {
        const asset = await getMediaAsset(publication.mediaAssetId);
        if (asset) {
          const ab = asset.bytes.buffer.slice(asset.bytes.byteOffset, asset.bytes.byteOffset + asset.bytes.byteLength) as ArrayBuffer;
          const imageUrn = await uploadImage(accessToken, publication.authorUrn, ab, asset.mimeType);
          media = { imageUrn, altText: publication.commentary.slice(0, 300) };
        }
      }
      const result = await createMemberPost(accessToken, publication.authorUrn, publication.commentary, media);
      externalPostUrn = result.postUrn;
      externalUrl = result.url;
    }

    await prisma.publication.update({
      where: { id: publication.id },
      data: { status: "PUBLISHED", externalPostUrn, externalUrl, publishedAt: new Date(), lockedAt: null },
    });
    return { id: publication.id, status: "PUBLISHED" as const, url: externalUrl };
  } catch (error) {
    // publication.attempts é o valor PRÉ-claim (o claim incrementa no banco); soma 1
    // para o handler decidir retry/FAILED com o contador real — senão a última
    // tentativa vira um PENDING zumbi que o filtro attempts<MAX nunca mais pega.
    return handlePublishError(publication.id, publication.attempts + 1, connection.id, error);
  }
}

async function handlePublishError(publicationId: string, attempts: number, connectionId: string, error: unknown) {
  const expired = error instanceof LinkedInApiError && error.reason === "token_expired";
  const igExpired = error instanceof InstagramApiError && error.reason === "token_expired";
  if (expired || igExpired) {
    await prisma.socialConnection.update({ where: { id: connectionId }, data: { status: "EXPIRED" } });
    await prisma.publication.update({ where: { id: publicationId }, data: { status: "FAILED", lockedAt: null, error: "conexao_expirada_reconecte" } });
    return { id: publicationId, status: "FAILED" as const };
  }
  const forbidden = (error instanceof LinkedInApiError || error instanceof InstagramApiError) && error.reason === "forbidden";
  if (forbidden) {
    await prisma.publication.update({ where: { id: publicationId }, data: { status: "FAILED", lockedAt: null, error: "permissao_negada" } });
    return { id: publicationId, status: "FAILED" as const };
  }

  // Transitório (429/5xx/rede): volta para a fila enquanto houver tentativa; senão FAILED com alerta.
  const message = error instanceof Error ? error.message : "erro_desconhecido";
  const canRetry = attempts < MAX_PUBLISH_ATTEMPTS;
  await prisma.publication.update({
    where: { id: publicationId },
    data: canRetry ? { status: "PENDING", lockedAt: null, error: message } : { status: "FAILED", lockedAt: null, error: message },
  });
  if (!canRetry) {
    await notifyAlert(`Publicação ${publicationId} falhou após ${attempts} tentativas`, { error: message });
  }
  return { id: publicationId, status: canRetry ? ("PENDING" as const) : ("FAILED" as const) };
}

// Ciclo periódico: renova tokens do Instagram (tem refresh) e avisa reconexão do
// LinkedIn (não tem). Marca EXPIRED quem já venceu.
export async function runSocialExpiryNoticeCycle(now = new Date()) {
  let refreshed = 0;
  let notified = 0;

  // Instagram: renova tokens que estão perto de expirar (≤15 dias). O token, nesse
  // ponto, tem ~45 dias de idade — bem acima do mínimo de 24h exigido pelo refresh.
  const igThreshold = new Date(now.getTime() + IG_REFRESH_WHEN_DAYS_LEFT * DAY_MS);
  const igExpiring = await prisma.socialConnection.findMany({
    where: { platform: "instagram", status: "ACTIVE", tokenExpiresAt: { lte: igThreshold, gt: now } },
    take: 100,
  });
  for (const conn of igExpiring) {
    try {
      const fresh = await refreshInstagramToken(decryptSecret(conn.encryptedToken));
      await prisma.socialConnection.update({
        where: { id: conn.id },
        data: { encryptedToken: encryptSecret(fresh.accessToken), tokenExpiresAt: new Date(now.getTime() + fresh.expiresInSeconds * 1000), expiryNoticeSentAt: null },
      });
      refreshed += 1;
    } catch (error) {
      // Refresh falhou (token revogado?) → marca EXPIRED e pede reconexão.
      await prisma.socialConnection.update({ where: { id: conn.id }, data: { status: "EXPIRED" } });
      await notifyReconnect(conn.tenantId, conn.id, "instagram", conn.tokenExpiresAt);
      console.error(JSON.stringify({ event: "ig_refresh_failed", connectionId: conn.id, error: error instanceof Error ? error.message : "unknown" }));
    }
  }

  // LinkedIn: sem refresh no self-serve → avisa (uma vez) para reconectar.
  const liThreshold = new Date(now.getTime() + EXPIRY_WARNING_DAYS * DAY_MS);
  const liExpiring = await prisma.socialConnection.findMany({
    where: { platform: "linkedin", status: "ACTIVE", tokenExpiresAt: { lte: liThreshold, gt: now }, expiryNoticeSentAt: null },
    take: 100,
  });
  for (const conn of liExpiring) {
    await notifyReconnect(conn.tenantId, conn.id, "linkedin", conn.tokenExpiresAt);
    notified += 1;
  }

  const expired = await prisma.socialConnection.updateMany({ where: { status: "ACTIVE", tokenExpiresAt: { lte: now } }, data: { status: "EXPIRED" } });
  return { refreshed, notified, markedExpired: expired.count };
}

async function notifyReconnect(tenantId: string, connectionId: string, platform: Platform, tokenExpiresAt: Date) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: { memberships: { include: { user: true }, take: 1 } } });
  const owner = tenant?.memberships[0]?.user;
  if (!owner) return;
  const label = platform === "instagram" ? "Instagram" : "LinkedIn";
  const dateStr = tokenExpiresAt.toLocaleDateString("pt-BR");
  await sendTransactionalEmail({
    to: owner.email,
    userId: owner.id,
    subject: `Reconecte seu ${label} no Cortex`,
    text: `Sua conexão do ${label} com o Cortex expira em ${dateStr}. Para continuar publicando, reconecte em https://cortex.nutef.com/painel (leva 1 clique).`,
    html: `<p>Sua conexão do ${label} com o Cortex expira em <b>${dateStr}</b>.</p><p>Para continuar publicando, <a href="https://cortex.nutef.com/painel">reconecte no painel</a> — leva 1 clique.</p>`,
  }).catch(() => null);
  await prisma.socialConnection.update({ where: { id: connectionId }, data: { expiryNoticeSentAt: new Date() } });
}
