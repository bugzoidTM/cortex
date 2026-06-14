import { getMvpSnapshot } from "@/lib/cortex-mvp";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getMvpSnapshot();
  return Response.json(snapshot);
}
