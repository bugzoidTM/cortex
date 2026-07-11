import { AuthRequiredError, requireCurrentSession } from "@/lib/auth";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, LinkedInApiError } from "@/lib/linkedin";
import { IG_ALLOWED_IMAGE_TYPES, IG_MAX_IMAGE_BYTES, InstagramApiError } from "@/lib/instagram";
import { storeMediaAsset } from "@/lib/media";
import { checkRateLimit, RateLimitExceededError } from "@/lib/rate-limit";
import { cancelPublication, enqueuePublication, listPublications, Platform, PublicationBlockedError } from "@/lib/social";
import { ZodError } from "zod";

export const dynamic = "force-dynamic";

function handle(error: unknown) {
  if (error instanceof AuthRequiredError) {
    return Response.json({ ok: false, error: "auth_required" }, { status: 401 });
  }
  if (error instanceof RateLimitExceededError) {
    return Response.json({ ok: false, error: "rate_limited", retryAfterSeconds: error.retryAfterSeconds }, { status: 429 });
  }
  if (error instanceof ZodError) {
    return Response.json({ ok: false, error: "invalid_input", issues: error.flatten() }, { status: 400 });
  }
  if (error instanceof PublicationBlockedError) {
    return Response.json({ ok: false, error: error.reason }, { status: 409 });
  }
  if (error instanceof LinkedInApiError || error instanceof InstagramApiError) {
    return Response.json({ ok: false, error: "image_upload_failed" }, { status: 502 });
  }
  throw error;
}

function parsePlatform(value: FormDataEntryValue | null): Platform {
  return value === "instagram" ? "instagram" : "linkedin";
}

export async function GET() {
  try {
    const session = await requireCurrentSession();
    const publications = await listPublications(session.tenantId);
    return Response.json({ ok: true, publications });
  } catch (error) {
    return handle(error);
  }
}

// Publicar exige a ação explícita do usuário: ele envia o texto final revisado e,
// opcionalmente, uma imagem e/ou um horário agendado. A imagem (anexada ou gerada por
// IA) é guardada como MediaAsset; o worker faz o upload específico de cada rede na
// hora de publicar. Instagram exige imagem JPEG. Recebe multipart/form-data.
export async function POST(request: Request) {
  try {
    const session = await requireCurrentSession();
    await checkRateLimit({ key: `publication:${session.tenantId}:${session.userId}`, action: "publication", limit: 30, windowSeconds: 24 * 60 * 60 });

    const form = await request.formData();
    const platform = parsePlatform(form.get("platform"));
    const commentary = String(form.get("commentary") ?? "");
    const artifactId = form.get("artifactId") ? String(form.get("artifactId")) : undefined;
    const scheduledFor = form.get("scheduledFor") ? String(form.get("scheduledFor")) : undefined;
    // mediaAssetId chega quando a imagem já foi gerada por IA e aprovada (Etapa B).
    let mediaAssetId = form.get("mediaAssetId") ? String(form.get("mediaAssetId")) : undefined;
    const image = form.get("image");

    if (image && typeof image === "object" && "arrayBuffer" in image) {
      const file = image as File;
      const allowed = platform === "instagram" ? IG_ALLOWED_IMAGE_TYPES : ALLOWED_IMAGE_TYPES;
      const maxBytes = platform === "instagram" ? IG_MAX_IMAGE_BYTES : MAX_IMAGE_BYTES;
      if (!allowed.includes(file.type)) {
        return Response.json({ ok: false, error: platform === "instagram" ? "instagram_formato_invalido" : "image_type_unsupported" }, { status: 400 });
      }
      if (file.size > maxBytes) {
        return Response.json({ ok: false, error: "image_too_large" }, { status: 400 });
      }
      const bytes = await file.arrayBuffer();
      mediaAssetId = await storeMediaAsset(session.tenantId, bytes, file.type);
    }

    if (platform === "instagram" && !mediaAssetId) {
      return Response.json({ ok: false, error: "instagram_requer_imagem" }, { status: 400 });
    }

    const publication = await enqueuePublication(session.tenantId, { platform, commentary, artifactId, scheduledFor, mediaAssetId });
    return Response.json({ ok: true, publication: { id: publication.id, status: publication.status, scheduledFor: publication.scheduledFor } }, { status: 201 });
  } catch (error) {
    return handle(error);
  }
}

// Cancela uma publicação agendada/na fila que ainda não saiu.
export async function DELETE(request: Request) {
  try {
    const session = await requireCurrentSession();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return Response.json({ ok: false, error: "missing_id" }, { status: 400 });
    }
    const cancelled = await cancelPublication(session.tenantId, id);
    if (!cancelled) {
      return Response.json({ ok: false, error: "not_cancellable" }, { status: 409 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return handle(error);
  }
}
