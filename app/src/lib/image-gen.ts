import { readSecretEnv } from "./runtime-config";

// Geração de imagem por IA via worker próprio da Nutef (Cloudflare Worker, o mesmo
// que gera as capas do Instagram do Apostileiros). Contrato estilo OpenAI Images:
// POST {url} com {ratio, prompt} → {data:[{b64_json}]} em JPEG. Latência típica ~5-30s.

const DEFAULT_TIMEOUT_MS = 180_000;

export type ImageRatio = "1:1" | "9:16" | "16:9";

export class ImageGenError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ImageGenError";
  }
}

function getWorkerUrl() {
  return process.env.CORTEX_IMAGE_WORKER_URL;
}
function getWorkerToken() {
  return readSecretEnv("CORTEX_IMAGE_WORKER_TOKEN");
}

export function isImageGenConfigured() {
  return Boolean(getWorkerUrl() && getWorkerToken());
}

// Molda o pedido do usuário num prompt fotográfico seguro: sem texto na imagem
// (texto gerado por IA sai ilegível) e com direção de estilo consistente.
export function buildImagePrompt(userText: string) {
  const subject = userText.trim().replace(/\s+/g, " ").slice(0, 600);
  return `Fotografia profissional para post de rede social: ${subject}. Iluminação natural, composição limpa, alta qualidade. Sem nenhum texto, letra, logotipo ou marca d'água na imagem.`;
}

export async function generateImage(prompt: string, ratio: ImageRatio): Promise<{ bytes: Buffer; mimeType: string }> {
  const url = getWorkerUrl();
  const token = getWorkerToken();
  if (!url || !token) {
    throw new ImageGenError(503, "image_gen_not_configured");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ratio, prompt }),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  }).catch((error) => {
    throw new ImageGenError(504, error instanceof Error && error.name === "TimeoutError" ? "image_gen_timeout" : "image_gen_network");
  });

  if (!res.ok) {
    throw new ImageGenError(res.status >= 500 ? 502 : res.status, `image_gen_http_${res.status}`);
  }
  const json = (await res.json().catch(() => null)) as { data?: Array<{ b64_json?: string }> } | null;
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) {
    throw new ImageGenError(502, "image_gen_empty");
  }
  return { bytes: Buffer.from(b64, "base64"), mimeType: "image/jpeg" };
}
