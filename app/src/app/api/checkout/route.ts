import { createSelfServiceCheckout } from "@/lib/billing";
import { ZodError } from "zod";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const checkout = await createSelfServiceCheckout(body);
    return Response.json(
      {
        ok: true,
        checkout,
        paymentLinkUrl: checkout.paymentLinkUrl,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ ok: false, error: "invalid_input", issues: error.flatten() }, { status: 400 });
    }
    if (error instanceof Error && error.message === "woovi_app_id_missing") {
      return Response.json({ ok: false, error: "woovi_not_configured" }, { status: 503 });
    }
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return Response.json({ ok: false, error: "email_or_company_already_exists" }, { status: 409 });
    }
    throw error;
  }
}
