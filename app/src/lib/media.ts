import { prisma } from "./prisma";

// Imagens hospedadas para o Instagram buscar por URL (a Meta faz cURL na image_url).
// Guardamos o JPEG no banco (compartilhado entre web e worker) e servimos em
// /api/media/{id} — o id (cuid) funciona como capability; a imagem vai a público mesmo.

export async function storeMediaAsset(tenantId: string, bytes: ArrayBuffer, mimeType: string): Promise<string> {
  const asset = await prisma.mediaAsset.create({
    data: { tenantId, mimeType, bytes: Buffer.from(bytes) },
    select: { id: true },
  });
  return asset.id;
}

export async function getMediaAsset(id: string): Promise<{ mimeType: string; bytes: Buffer } | null> {
  const asset = await prisma.mediaAsset.findUnique({ where: { id }, select: { mimeType: true, bytes: true } });
  if (!asset) return null;
  return { mimeType: asset.mimeType, bytes: Buffer.from(asset.bytes) };
}

export function publicMediaUrl(id: string): string {
  const base = process.env.CORTEX_PUBLIC_URL ?? "https://cortex.nutef.com";
  return `${base}/api/media/${id}`;
}

// Limpeza: apaga imagens que não estão presas a uma publicação ainda por sair
// (agendadas podem estar até 30 dias à frente) e já passaram de 2 dias.
export async function pruneOldMediaAssets(now = new Date()) {
  const cutoff = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const result = await prisma.mediaAsset.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      publications: { none: { status: { in: ["PENDING", "PUBLISHING"] } } },
    },
  });
  return result.count;
}
