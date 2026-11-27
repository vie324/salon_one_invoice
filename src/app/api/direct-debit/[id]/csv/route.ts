import { NextResponse } from "next/server";
import { batchToCsv } from "@/lib/bank/csv";
import { forbiddenUnless } from "@/lib/access";
import { getServiceRepository } from "@/lib/data";
import { canAccessBilling } from "@/lib/domain/constants";

/** NSS 引き落としの一覧を、NSS へ金額を登録するときの確認用 CSV としてダウンロード。 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const denied = await forbiddenUnless(canAccessBilling);
  if (denied) return denied;
  const repo = await getServiceRepository();
  const batch = await repo.getBatch(id);
  if (!batch) return new NextResponse("Not found", { status: 404 });
  const [customers, mandates, invoices] = await Promise.all([
    repo.listCustomers(),
    repo.listMandates(),
    repo.listInvoices({ paymentMethod: "direct_debit" }),
  ]);
  const csv = batchToCsv(batch, customers, mandates, invoices);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nss-debit-${batch.scheduledDate}.csv"`,
    },
  });
}
