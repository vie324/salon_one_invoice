import { NextResponse } from "next/server";
import { cronSecret, invoiceAutoEmail, isDemoMode } from "@/lib/config";
import { getJobRepository } from "@/lib/data";
import { getEmailProvider } from "@/lib/email";
import { invoiceEmailHtml } from "@/lib/email/templates";

export const dynamic = "force-dynamic";

/**
 * 定期請求の自動生成 + 請求書メールの自動送付。Vercel Cron から日次で呼ばれる想定。
 * Authorization: Bearer <CRON_SECRET> で保護（Vercel Cron は自動付与）。
 * INVOICE_AUTO_EMAIL=false で自動メール送付のみ無効化できる。
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const isVercelCron = request.headers.get("x-vercel-cron") != null;
  const authorized =
    isDemoMode ||
    isVercelCron ||
    (cronSecret.length > 0 && auth === `Bearer ${cronSecret}`);

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const repo = await getJobRepository();
    const { created } = await repo.runRecurringBilling();

    // 生成した請求書をメールで自動送付(メールアドレス登録済みの顧客のみ)
    let emailed = 0;
    const emailErrors: string[] = [];
    if (invoiceAutoEmail && created.length > 0) {
      const org = await repo.getOrganization();
      const provider = getEmailProvider();
      for (const inv of created) {
        try {
          const full = await repo.getInvoice(inv.id);
          if (!full?.customer?.email) continue;
          const res = await provider.send({
            to: full.customer.email,
            subject: `【${org.name}】請求書 ${full.invoiceNumber} のご案内`,
            html: invoiceEmailHtml({
              invoice: full,
              customerName: full.customer.name,
              org,
            }),
          });
          if (res.ok) emailed++;
          else emailErrors.push(`${full.invoiceNumber}: ${res.message}`);
        } catch (err) {
          emailErrors.push(`${inv.invoiceNumber}: ${(err as Error).message}`);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      created: created.length,
      invoiceNumbers: created.map((i) => i.invoiceNumber),
      autoEmail: invoiceAutoEmail,
      emailed,
      emailErrors,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
