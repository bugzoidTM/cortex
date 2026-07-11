import { getMediaAsset } from "@/lib/media";

export const dynamic = "force-dynamic";

// Rota PÚBLICA (sem sessão) — o Instagram busca a imagem por esta URL. O id é um
// capability (cuid não-adivinhável) e a imagem é destinada a virar pública mesmo.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = await getMediaAsset(id);
  if (!asset) {
    return new Response("not found", { status: 404 });
  }
  return new Response(new Uint8Array(asset.bytes), {
    status: 200,
    headers: {
      "content-type": asset.mimeType,
      "cache-control": "public, max-age=86400",
      "content-length": String(asset.bytes.length),
    },
  });
}
