import { z } from "zod";
import { notifyAlert } from "./alerts";
import { decryptSecret, encryptSecret } from "./crypto";
import { sendTransactionalEmail } from "./email";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  createMemberPost,
  fetchUserInfo,
  LinkedInApiError,
  LinkedInToken,
  uploadImage,
} from "./linkedin";
import { prisma } from "./prisma";

const PLATFORM = "linkedin";
const MAX_PUBLISH_ATTEMPTS = 3;
// Publicação presa em PUBLISHING além disso é órfã de um worker que morreu no meio.
const STALE_PUBLICATION_MINUTES = 15;
// Avisa o cliente para reconectar quando faltar isso para o token de 60 dias expirar.
const EXPIRY_WARNING_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
// Agendamento: no máximo 30 dias à frente (evita fila parada indefinidamente).
const MAX_SCHEDULE_DAYS = 30;

// LinkedIn (self-serve) limita o post a ~3000 caracteres de commentary.
export const createPublicationSchema = z.object({
  commentary: z.string().min(1).max(3000),
  artifactId: z.string().min(1).optional(),
  imageUrns: z.array(z.string()).max(1).optional(),
  altText: z.string().max(1000).optional(),
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
});

export class PublicationBlockedError extends Error {
  constructor(public readonly reason: "not_connected" | "connection_expired") {
    super(reason);
    this.name = "PublicationBlockedError";
  }
}

export type PublicSocialConnection = {
  connected: boolean;
  platform: string;
  displayName: string | null;
  status: string | null;
  tokenExpiresAt: Date | null;
  expiringSoon: boolean;
};

export async function getSocialConnectionStatus(tenantId: string): Promise<PublicSocialConnection> {
  const connection = await prisma.socialConnection.findUnique({ where: { tenantId_platform: { tenantId, platform: PLATFORM } } });
  if (!connection) {
    return { connected: false, platform: PLATFORM, displayName: null, status: null, tokenExpiresAt: null, expiringSoon: false };
  }

  const live = liveStatus(connection.status, connection.tokenExpiresAt);
  return {
    connected: live === "ACTIVE",
    platform: PLATFORM,
    displayName: connection.displayName,
    status: live,
    tokenExpiresAt: connection.tokenExpiresAt,
    expiringSoon: live === "ACTIVE" && connection.tokenExpiresAt.getTime() - Date.now() < EXPIRY_WARNING_DAYS * DAY_MS,
  };
}

// Deriva o status vivo: um token vencido é EXPIRED mesmo que o banco ainda diga ACTIVE.
function liveStatus(stored: string, tokenExpiresAt: Date) {
  if (stored === "ACTIVE" && tokenExpiresAt <= new Date()) return "EXPIRED";
  return stored;
}

export async function saveLinkedInConnection(tenantId: string, userId: string, token: LinkedInToken) {
  const info = await fetchUserInfo(token.accessToken);
  const tokenExpiresAt = new Date(Date.now() + (token.expiresInSeconds || ACCESS_TOKEN_TTL_SECONDS) * 1000);

  await prisma.socialConnection.upsert({
    where: { tenantId_platform: { tenantId, platform: PLATFORM } },
    update: {
      externalId: info.sub,
      externalUrn: info.personUrn,
      displayName: info.name ?? null,
      scopes: token.scope.split(" ").filter(Boolean),
      encryptedToken: encryptSecret(token.accessToken),
      tokenExpiresAt,
      status: "ACTIVE",
      expiryNoticeSentAt: null,
      connectedByUserId: userId,
    },
    create: {
      tenantId,
      platform: PLATFORM,
      externalId: info.sub,
      externalUrn: info.personUrn,
      displayName: info.name ?? null,
      scopes: token.scope.split(" ").filter(Boolean),
      encryptedToken: encryptSecret(token.accessToken),
      tokenExpiresAt,
      status: "ACTIVE",
      connectedByUserId: userId,
    },
  });

  return { displayName: info.name ?? null };
}

export async function disconnectSocial(tenantId: string) {
  await prisma.socialConnection.deleteMany({ where: { tenantId, platform: PLATFORM } });
  return getSocialConnectionStatus(tenantId);
}

async function requireActiveConnection(tenantId: string) {
  const connection = await prisma.socialConnection.findUnique({ where: { tenantId_platform: { tenantId, platform: PLATFORM } } });
  if (!connection) {
    throw new PublicationBlockedError("not_connected");
  }
  if (liveStatus(connection.status, connection.tokenExpiresAt) !== "ACTIVE") {
    throw new PublicationBlockedError("connection_expired");
  }
  return connection;
}

// Faz upload de uma imagem para a conta LinkedIn do tenant e devolve o URN a anexar no post.
// É feito na hora do request (não guardamos o binário): o URN vai para a fila.
export async function uploadPublicationImage(tenantId: string, bytes: ArrayBuffer, contentType: string): Promise<string> {
  const connection = await requireActiveConnection(tenantId);
  const accessToken = decryptSecret(connection.encryptedToken);
  return uploadImage(accessToken, connection.externalUrn, bytes, contentType);
}

// Enfileira uma publicação. `commentary` é o texto final que o usuário revisou e aprovou
// (a ação explícita exigida pelos Termos da API do LinkedIn — nada é postado sozinho).
export async function enqueuePublication(tenantId: string, input: unknown) {
  const parsed = createPublicationSchema.parse(input);
  const connection = await requireActiveConnection(tenantId);

  return prisma.publication.create({
    data: {
      tenantId,
      connectionId: connection.id,
      artifactId: parsed.artifactId ?? null,
      platform: PLATFORM,
      authorUrn: connection.externalUrn,
      commentary: parsed.commentary,
      mediaImageUrns: parsed.imageUrns ?? [],
      scheduledFor: parsed.scheduledFor ? new Date(parsed.scheduledFor) : null,
      status: "PENDING",
    },
  });
}

// Cancela uma publicação que ainda não saiu (agendada ou na fila).
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
    await prisma.publication.update({
      where: { id: publication.id },
      data: { status: "FAILED", lockedAt: null, error: "conexao_expirada_reconecte" },
    });
    return { id: publication.id, status: "FAILED" as const };
  }

  try {
    const accessToken = decryptSecret(connection.encryptedToken);
    const imageUrn = publication.mediaImageUrns[0];
    const result = await createMemberPost(
      accessToken,
      publication.authorUrn,
      publication.commentary,
      imageUrn ? { imageUrn, altText: publication.commentary } : undefined,
    );
    await prisma.publication.update({
      where: { id: publication.id },
      data: { status: "PUBLISHED", externalPostUrn: result.postUrn, externalUrl: result.url, publishedAt: new Date(), lockedAt: null },
    });
    return { id: publication.id, status: "PUBLISHED" as const, url: result.url };
  } catch (error) {
    return handlePublishError(publication.id, publication.attempts, connection.id, error);
  }
}

async function handlePublishError(publicationId: string, attempts: number, connectionId: string, error: unknown) {
  // Token expirado/revogado: marca a conexão para o cliente reconectar; nem adianta tentar de novo.
  if (error instanceof LinkedInApiError && error.reason === "token_expired") {
    await prisma.socialConnection.update({ where: { id: connectionId }, data: { status: "EXPIRED" } });
    await prisma.publication.update({ where: { id: publicationId }, data: { status: "FAILED", lockedAt: null, error: "conexao_expirada_reconecte" } });
    return { id: publicationId, status: "FAILED" as const };
  }
  if (error instanceof LinkedInApiError && error.reason === "forbidden") {
    await prisma.publication.update({ where: { id: publicationId }, data: { status: "FAILED", lockedAt: null, error: "permissao_negada_linkedin" } });
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

// Avisa (uma vez) o titular quando a conexão está perto de expirar — não há refresh no
// self-serve do LinkedIn, então o cliente precisa reconectar manualmente a cada ~60 dias.
export async function runSocialExpiryNoticeCycle(now = new Date()) {
  const threshold = new Date(now.getTime() + EXPIRY_WARNING_DAYS * DAY_MS);
  const expiring = await prisma.socialConnection.findMany({
    where: { status: "ACTIVE", tokenExpiresAt: { lte: threshold, gt: now }, expiryNoticeSentAt: null },
    include: { tenant: { include: { memberships: { include: { user: true }, take: 1 } } } },
    take: 100,
  });

  let notified = 0;
  for (const connection of expiring) {
    const owner = connection.tenant.memberships[0]?.user;
    if (!owner) continue;
    const dateStr = connection.tokenExpiresAt.toLocaleDateString("pt-BR");
    await sendTransactionalEmail({
      to: owner.email,
      userId: owner.id,
      subject: "Reconecte seu LinkedIn no Cortex",
      text: `Sua conexão do LinkedIn com o Cortex expira em ${dateStr}. Para continuar publicando, reconecte em https://cortex.nutef.com/#acesso (leva 1 clique). O LinkedIn exige reautorização periódica por segurança.`,
      html: `<p>Sua conexão do LinkedIn com o Cortex expira em <b>${dateStr}</b>.</p><p>Para continuar publicando, <a href="https://cortex.nutef.com/#acesso">reconecte no console</a> — leva 1 clique. O LinkedIn exige reautorização periódica por segurança.</p>`,
    }).catch(() => null);
    await prisma.socialConnection.update({ where: { id: connection.id }, data: { expiryNoticeSentAt: now } });
    notified += 1;
  }

  // Marca como EXPIRED quem já passou do prazo (para a UI mostrar o estado correto).
  const expired = await prisma.socialConnection.updateMany({
    where: { status: "ACTIVE", tokenExpiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });

  return { notified, markedExpired: expired.count };
}
