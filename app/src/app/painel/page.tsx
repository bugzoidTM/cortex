import type { Metadata } from "next";
import { Dashboard } from "./dashboard";

export const metadata: Metadata = {
  title: "Painel — Cortex",
  description: "Seu painel do Cortex: criar conteúdo, publicar, voz da marca e conta.",
  robots: { index: false, follow: false },
};

export default function PainelPage() {
  return <Dashboard />;
}
