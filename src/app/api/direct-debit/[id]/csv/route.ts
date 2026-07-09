import { NextResponse } from "next/server";
import { batchToCsv } from "@/lib/bank/csv";
import { getRepository } from "@/lib/data";

/** 口座振替バッチを収納代行向けCSVとしてダウンロード。 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const repo = await getRepository();
  const batch = await repo.getBatch(id);
  if (!batch) return new NextResponse("Not found", { status: 404 });
  const customers = await repo.listCustomers();
  const mandates = await Promise.all(
    customers.map((c) => repo.getMandateByCustomer(c.id)),
  );
  const csv = batchToCsv(
    batch,
    customers,
    mandates.filter((m): m is NonNullable<typeof m> => m != null),
  );
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="direct-debit-${id}.csv"`,
    },
  });
}
