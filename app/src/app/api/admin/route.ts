import { AuthRequiredError, requireSuperuserSession, SuperuserRequiredError } from "@/lib/auth";
import { createAdminTenant, createAdminUser, getAdminDashboard, updateAdminTenant, upsertAdminModelConfig } from "@/lib/admin";
import { ZodError } from "zod";

export const dynamic = "force-dynamic";

type AdminAction = "create_tenant" | "update_tenant" | "create_user" | "upsert_model_config";

function handleAdminError(error: unknown) {
  if (error instanceof AuthRequiredError) {
    return Response.json({ ok: false, error: "auth_required" }, { status: 401 });
  }
  if (error instanceof SuperuserRequiredError) {
    return Response.json({ ok: false, error: "superuser_required" }, { status: 403 });
  }
  if (error instanceof ZodError) {
    return Response.json({ ok: false, error: "invalid_input", issues: error.flatten() }, { status: 400 });
  }
  throw error;
}

export async function GET() {
  try {
    const session = await requireSuperuserSession();
    const dashboard = await getAdminDashboard();
    return Response.json({ ok: true, superuser: { email: session.email }, ...dashboard });
  } catch (error) {
    return handleAdminError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireSuperuserSession();
    const body = (await request.json().catch(() => null)) as { action?: AdminAction; payload?: unknown } | null;
    if (!body?.action) {
      return Response.json({ ok: false, error: "missing_action" }, { status: 400 });
    }

    if (body.action === "create_tenant") {
      const tenant = await createAdminTenant(body.payload);
      return Response.json({ ok: true, tenant }, { status: 201 });
    }

    if (body.action === "update_tenant") {
      const tenant = await updateAdminTenant(body.payload);
      return Response.json({ ok: true, tenant });
    }

    if (body.action === "create_user") {
      const user = await createAdminUser(body.payload);
      return Response.json({ ok: true, user }, { status: 201 });
    }

    if (body.action === "upsert_model_config") {
      const modelConfig = await upsertAdminModelConfig(body.payload);
      return Response.json({ ok: true, modelConfig });
    }

    return Response.json({ ok: false, error: "unknown_action" }, { status: 400 });
  } catch (error) {
    return handleAdminError(error);
  }
}
