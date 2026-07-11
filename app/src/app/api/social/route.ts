import { AuthRequiredError, requireCurrentSession } from "@/lib/auth";
import { disconnectSocial, getSocialOverview, Platform } from "@/lib/social";

export const dynamic = "force-dynamic";

function handle(error: unknown) {
  if (error instanceof AuthRequiredError) {
    return Response.json({ ok: false, error: "auth_required" }, { status: 401 });
  }
  throw error;
}

function parsePlatform(value: string | null): Platform | null {
  return value === "linkedin" || value === "instagram" ? value : null;
}

export async function GET() {
  try {
    const session = await requireCurrentSession();
    const overview = await getSocialOverview(session.tenantId);
    return Response.json({ ok: true, ...overview });
  } catch (error) {
    return handle(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireCurrentSession();
    const platform = parsePlatform(new URL(request.url).searchParams.get("platform"));
    if (!platform) {
      return Response.json({ ok: false, error: "invalid_platform" }, { status: 400 });
    }
    const connection = await disconnectSocial(session.tenantId, platform);
    return Response.json({ ok: true, connection });
  } catch (error) {
    return handle(error);
  }
}
