import nodemailer from "nodemailer";
import { prisma } from "./prisma";
import { readSecretEnv } from "./runtime-config";

// Persistência operacional: cada envio cria/atualiza um registro EmailMessage.

export type TransactionalEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  userId?: string | null;
  // Versões redigidas para persistência: o corpo real vai só ao destinatário.
  // Usado quando o e-mail carrega segredo de uso único (ex.: token de reset de senha).
  storageText?: string;
  storageHtml?: string;
};

export function getEmailRuntimeStatus() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = readSecretEnv("SMTP_PASSWORD");
  return {
    configured: Boolean(host && user && password),
    provider: host ? "smtp" : "outbox-only",
    host: host ?? null,
    userConfigured: Boolean(user),
    passwordSource: password ? (process.env.SMTP_PASSWORD ? "env" : "file") : "missing",
    from: process.env.SMTP_FROM ?? null,
  };
}

export async function sendTransactionalEmail(input: TransactionalEmailInput) {
  const message = await prisma.emailMessage.create({
    data: {
      userId: input.userId ?? null,
      to: input.to.toLowerCase(),
      subject: input.subject,
      text: input.storageText ?? input.text,
      html: input.storageHtml ?? input.html,
      status: "PENDING",
      provider: "smtp",
    },
  });

  const status = getEmailRuntimeStatus();
  if (!status.configured) {
    await prisma.emailMessage.update({
      where: { id: message.id },
      data: { status: "QUEUED", provider: "outbox-only" },
    });
    console.log(JSON.stringify({ event: "email_queued", to: input.to, subject: input.subject }));
    return { id: message.id, status: "QUEUED" as const };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: readSecretEnv("SMTP_PASSWORD"),
      },
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });

    await prisma.emailMessage.update({ where: { id: message.id }, data: { status: "SENT", sentAt: new Date() } });
    return { id: message.id, status: "SENT" as const };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "smtp_unknown_error";
    await prisma.emailMessage.update({ where: { id: message.id }, data: { status: "FAILED", error: messageText } });
    throw error;
  }
}
