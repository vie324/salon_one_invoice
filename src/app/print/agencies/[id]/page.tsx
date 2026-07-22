import { notFound } from "next/navigation";
import { getRepository } from "@/lib/data";
import { computeAgencyStatement, currentMonth } from "@/lib/domain/agency";
import { formatDate, formatJPY, formatPercent } from "@/lib/utils";
import { PrintButton } from "@/app/print/invoices/[id]/print-button";
import { LogoMark } from "@/components/brand/logo";

export const metadata = { title: "支払明細書（印刷）" };

/** 営業代理店向けの支払明細書(印刷/PDF)。 */
export default async function PrintAgencyStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : currentMonth();

  const repo = await getRepository();
  const agency = await repo.getAgency(id);
  if (!agency) notFound();
  const [members, customers, invoices, org] = await Promise.all([
    repo.listAgencyMembers(id),
    repo.listCustomers(),
    repo.listInvoices(),
    repo.getOrganization(),
  ]);
  const statement = computeAgencyStatement({ agency, members, customers, invoices, month });
  const [y, m] = month.split("-");

  return (
    <div className="min-h-screen bg-neutral-100 py-8">
      <div className="no-print mx-auto mb-6 flex max-w-3xl items-center justify-between px-4">
        <span className="text-sm text-neutral-500">ブラウザの「PDFで保存」で保存できます。</span>
        <PrintButton />
      </div>

      <div className="px-4">
        <div className="print-container mx-auto max-w-3xl rounded-lg border border-border bg-white p-8 text-[13px] text-neutral-900 shadow-sm sm:p-10">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-wide">支払明細書</h1>
              <p className="mt-1 text-neutral-500">
                {y}年{Number(m)}月分 紹介手数料
              </p>
            </div>
            <div className="text-right text-xs text-neutral-600">
              <div>発行日: {formatDate(new Date())}</div>
              <div className="tabular">対象月: {month}</div>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-8 sm:flex-row sm:justify-between">
            <div className="flex-1">
              <div className="text-lg font-semibold">{agency.name} 御中</div>
              {agency.contactName && (
                <div className="mt-1 text-neutral-600">ご担当: {agency.contactName} 様</div>
              )}
              <div className="mt-6 inline-flex flex-col rounded-md bg-neutral-50 px-4 py-3">
                <span className="text-xs text-neutral-500">
                  お支払金額（入金済売上 {formatJPY(statement.paidSubtotal)} ×{" "}
                  {formatPercent(agency.commissionRate, 0)}）
                </span>
                <span className="tabular text-2xl font-bold">{formatJPY(statement.commission)}</span>
              </div>
            </div>
            <div className="text-neutral-700 sm:text-right">
              <div className="flex items-center gap-2 sm:justify-end">
                <LogoMark size={34} />
                <span className="font-semibold text-neutral-900">{org.name}</span>
              </div>
              <div className="mt-2 text-xs leading-relaxed">
                {org.postalCode && <>〒{org.postalCode} </>}
                {org.address}
                {org.tel && (
                  <>
                    <br />
                    TEL: {org.tel}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* 営業担当別 */}
          <h2 className="mt-8 font-bold">営業担当別の内訳</h2>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-neutral-800 text-xs text-neutral-500">
                <th className="py-2 text-left font-medium">営業担当</th>
                <th className="py-2 text-right font-medium">顧客数</th>
                <th className="py-2 text-right font-medium">請求(税抜)</th>
                <th className="py-2 text-right font-medium">入金済(税抜)</th>
                <th className="py-2 text-right font-medium">支払額</th>
              </tr>
            </thead>
            <tbody>
              {statement.members.map((mem) => (
                <tr key={mem.memberId ?? "none"} className="border-b border-neutral-200">
                  <td className="py-2">{mem.memberName}</td>
                  <td className="tabular py-2 text-right">{mem.customerCount}件</td>
                  <td className="tabular py-2 text-right">{formatJPY(mem.invoicedSubtotal)}</td>
                  <td className="tabular py-2 text-right">{formatJPY(mem.paidSubtotal)}</td>
                  <td className="tabular py-2 text-right font-medium">{formatJPY(mem.commission)}</td>
                </tr>
              ))}
              {statement.members.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-3 text-center text-neutral-500">
                    対象月の実績はありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* 明細 */}
          <h2 className="mt-8 font-bold">明細（対象請求）</h2>
          <table className="mt-2 w-full border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-neutral-800 text-neutral-500">
                <th className="py-1.5 text-left font-medium">請求書番号</th>
                <th className="py-1.5 text-left font-medium">顧客</th>
                <th className="py-1.5 text-left font-medium">営業担当</th>
                <th className="py-1.5 text-right font-medium">金額(税抜)</th>
                <th className="py-1.5 text-right font-medium">入金状況</th>
              </tr>
            </thead>
            <tbody>
              {statement.lines.map((l) => (
                <tr key={l.invoiceId} className="border-b border-neutral-200">
                  <td className="tabular py-1.5">{l.invoiceNumber}</td>
                  <td className="py-1.5">{l.customerName}</td>
                  <td className="py-1.5 text-neutral-600">{l.memberName}</td>
                  <td className="tabular py-1.5 text-right">{formatJPY(l.subtotal)}</td>
                  <td className="py-1.5 text-right">{l.paid ? "入金済" : "未入金(対象外)"}</td>
                </tr>
              ))}
              {statement.lines.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-3 text-center text-neutral-500">
                    対象月の請求はありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="mt-6 flex justify-end">
            <div className="w-72 space-y-1.5 text-sm">
              <div className="flex justify-between text-neutral-600">
                <span>対象請求合計（税抜）</span>
                <span className="tabular">{formatJPY(statement.invoicedSubtotal)}</span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>入金済売上（税抜）</span>
                <span className="tabular">{formatJPY(statement.paidSubtotal)}</span>
              </div>
              <div className="flex justify-between border-t-2 border-neutral-800 pt-2 text-base font-bold">
                <span>お支払金額</span>
                <span className="tabular">{formatJPY(statement.commission)}</span>
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-md border border-neutral-200 bg-neutral-50 p-4 text-xs text-neutral-600">
            ※ 支払額は入金済み売上（税抜）に手数料率を乗じて算出しています。未入金分は入金確認後の月の明細に計上されます。
            内容に相違がある場合は1週間以内にご連絡ください。
          </div>
        </div>
      </div>
    </div>
  );
}
