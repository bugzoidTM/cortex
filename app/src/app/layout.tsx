import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://cortex.nutef.com"),
  title: "Cortex — Plataforma de conteúdo com IA",
  description:
    "Plataforma da Nutef para gerar pacotes de conteúdo em português no tom da marca, com revisão humana e controle de consumo.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Cortex — Plataforma de conteúdo com IA",
    description:
      "Gere pacotes de conteúdo em português, no tom da marca, com aprovação humana e controle de consumo.",
    url: "https://cortex.nutef.com/",
    siteName: "Cortex by Nutef",
    locale: "pt_BR",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
