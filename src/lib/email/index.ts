import { emailProvider } from "@/lib/config";
import { ConsoleEmailProvider } from "./console";
import type { EmailProvider } from "./provider";
import { ResendEmailProvider } from "./resend";

let cached: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (cached) return cached;
  if (emailProvider === "resend") {
    cached = new ResendEmailProvider(
      process.env.RESEND_API_KEY ?? "",
      process.env.EMAIL_FROM ?? "billing@example.com",
    );
  } else {
    cached = new ConsoleEmailProvider();
  }
  return cached;
}

export type { EmailProvider, EmailMessage, EmailResult } from "./provider";
