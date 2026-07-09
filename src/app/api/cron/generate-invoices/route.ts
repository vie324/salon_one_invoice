import { NextResponse } from "next/server";
import { cronSecret, isDemoMode } from "@/lib/config";
import { getJobRepository } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * 定期請求の自動生成。Vercel Cron から日次で呼ばれる想定。
 * Authorization: Bearer <CRON_SECRET> で保護（Vercel Cron は自動付与）。
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
    return NextResponse.json({
      ok: true,
      created: created.length,
      invoiceNumbers: created.map((i) => i.invoiceNumber),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
