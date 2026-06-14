import Link from "next/link";
import { AdminPanel } from "./admin-panel";

export const metadata = {
  title: "Painel administrativo Cortex — Nutef",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-[#071120] px-5 py-8 text-[#ECEFF4] lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.28em] text-[#F5A623]">Superusuário</p>
            <h1 className="mt-3 text-4xl font-black">Painel administrativo Cortex</h1>
            <p className="mt-3 max-w-3xl text-[#D6D3C4]">
              Administre tenants, usuários, quota, consumo, jobs e checklist de produção do SaaS Cortex.
            </p>
          </div>
          <Link className="rounded-full border border-[#2487D8]/40 px-5 py-3 text-sm font-bold text-[#7DC8F5]" href="/">
            Voltar ao app
          </Link>
        </div>
        <AdminPanel />
      </div>
    </main>
  );
}
