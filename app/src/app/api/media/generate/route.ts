import { z } from "zod";
import { AuthRequiredError, requireCurrentSession } from "@/lib/auth";
import { buildImagePrompt, generateImage, ImageGenError, isImageGenConfigured } from "@/lib/image-gen";
import { IG_MAX_IMAGE_BYTES } from "@/lib/instagram";
import { generateShortText } from "@/lib/llm-gateway";
import { storeMediaAsset } from "@/lib/media";
import { checkRateLimit, RateLimitExceededError } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  platform: z.enum(["linkedin", "instagram"]).default("linkedin"),
  // Descrição da imagem dada pelo usuário; se ausente, derivamos do texto do post.
  prompt: z.string().trim().max(800).optional(),
  commentary: z.string().trim().max(3000).optional(),
});

// Gera uma imagem por IA para a publicação e guarda como MediaAsset. A imagem NÃO
// é publicada aqui — vira uma prévia que o usuário aprova (ou regenera) no editor.
export async function POST(request: Request) {
  try {
    const session = await requireCurrentSession();
    if (!isImageGenConfigured()) {
      return Response.json({ ok: false, error: "image_gen_not_configured" }, { status: 503 });
    }
    await checkRateLimit({ key: `image_gen:${session.tenantId}`, action: "image_gen", limit: 30, windowSeconds: 24 * 60 * 60 });

    const parsed = bodySchema.parse(await request.json().catch(() => ({})));
    let base = parsed.prompt;
    if (!base && parsed.commentary && parsed.commentary.length >= 3) {
      // Texto de post costuma ser abstrato ("constância vence talento") e rende foto
      // genérica. O LLM do tenant converte em UMA cena concreta (padrão provado no
      // fluxo do Apostileiros); se indisponível, cai no texto cru.
      const scene = await generateShortText(
        session.tenantId,
        "Você transforma o texto de um post de rede social em UMA descrição curta de cena fotográfica concreta que ilustre a ideia. Responda só a descrição da cena, em português, até 50 palavras: objetos, ambiente, luz. Nada abstrato, sem pessoas em close, sem texto/letreiros na cena.",
        parsed.commentary.slice(0, 1500),
        120,
      );
      base = scene ?? parsed.commentary;
    }
    if (!base || base.length < 3) {
      return Response.json({ ok: false, error: "image_gen_sem_descricao" }, { status: 400 });
    }

    // Feed do Instagram aceita 4:5 a 1.91:1 — 1:1 é o seguro; LinkedIn fica bem em 16:9.
    const ratio = parsed.platform === "instagram" ? ("1:1" as const) : ("16:9" as const);
    const image = await generateImage(buildImagePrompt(base), ratio);

    if (parsed.platform === "instagram" && image.bytes.byteLength > IG_MAX_IMAGE_BYTES) {
      return Response.json({ ok: false, error: "image_too_large" }, { status: 502 });
    }

    const ab = image.bytes.buffer.slice(image.bytes.byteOffset, image.bytes.byteOffset + image.bytes.byteLength) as ArrayBuffer;
    const mediaAssetId = await storeMediaAsset(session.tenantId, ab, image.mimeType);
    return Response.json({ ok: true, mediaAssetId, url: `/api/media/${mediaAssetId}` }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return Response.json({ ok: false, error: "auth_required" }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return Response.json({ ok: false, error: "invalid_input" }, { status: 400 });
    }
    if (error instanceof RateLimitExceededError) {
      return Response.json({ ok: false, error: "rate_limited", retryAfterSeconds: error.retryAfterSeconds }, { status: 429 });
    }
    if (error instanceof ImageGenError) {
      console.error(JSON.stringify({ event: "image_gen_error", status: error.status, error: error.message }));
      return Response.json({ ok: false, error: "image_gen_failed" }, { status: 502 });
    }
    throw error;
  }
}
