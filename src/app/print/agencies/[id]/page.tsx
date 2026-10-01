import { notFound } from "next/navigation";
import { getServiceRepository } from "@/lib/data";
import { computeAgencyStatement } from "@/lib/domain/agency";
import { AGENCY_DEAL_TYPES } from "@/lib/domain/constants";
import { currentMonth, formatDate, formatJPY, formatPercent } from "@/lib/utils";
import { PrintButton } from "@/app/print/invoices/[id]/print-button";
import { LogoMark } from "@/components/brand/logo";

export const metadata = { title: "支払明細書（印刷）" };
export const dynamic = "force-dynamic";

/** 営業代理店向けの報酬の支払明細書(印刷/PDF)。対象月に初期費用の入金を確認した案件の報酬。 */
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

  const repo = await getServiceRepository();
  const agency = await repo.getAgency(id);
  if (!agency) notFound();
  const [members, customers, invoices, commissions, org] = await Promise.all([
    repo.listAgencyMembers(id),
    repo.listCustomers(),
    repo.listInvoices(),
    repo.listAgencyCommissions({ agencyId: id }),
    repo.getOrganization(),
  ]);
  const statement = computeAgencyStatement({
    agency,
    members,
    customers,
    invoices,
    commissions,
    month,
  });
  const [y, m] = month.split("-");

  return (
    <div className="min-h-screen bg-neutral-100 py-4 sm:py-8">
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
                {y}年{Number(m)}月分 代理店報酬
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
                  お支払金額（{statement.lines.length}件）
                </span>
                <span className="tabular text-2xl font-bold">{formatJPY(statement.total)}</span>
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
                {org.registrationNumber && (
                  <>
                    <br />
                    登録番号: {org.registrationNumber}
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
                <th className="py-2 text-right font-medium">件数</th>
                <th className="py-2 text-right font-medium">報酬</th>
              </tr>
            </thead>
            <tbody>
              {statement.members.map((mem) => (
                <tr key={mem.memberId ?? "none"} className="border-b border-neutral-200">
                  <td className="py-2">{mem.memberName}</td>
                  <td className="tabular py-2 text-right">{mem.count}件</td>
                  <td className="tabular py-2 text-right font-medium">{formatJPY(mem.total)}</td>
                </tr>
              ))}
              {statement.members.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-3 text-center text-neutral-500">
                    対象月の報酬はありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* 明細 */}
          <h2 className="mt-8 font-bold">明細</h2>
          <table className="mt-2 w-full border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-neutral-800 text-neutral-500">
                <th className="py-1.5 text-left font-medium">お客様</th>
                <th className="py-1.5 text-left font-medium">営業担当</th>
                <th className="py-1.5 text-left font-medium">区分</th>
                <th className="py-1.5 text-right font-medium">初期費用(税抜)</th>
                <th className="py-1.5 text-right font-medium">率</th>
                <th className="py-1.5 text-right font-medium">報酬</th>
              </tr>
            </thead>
            <tbody>
              {statement.lines.map((l) => (
                <tr key={l.commission.id} className="border-b border-neutral-200">
                  <td className="py-1.5">
                    {l.customerName}
                    <div className="text-[10px] text-neutral-500">入金確認 {formatDate(l.confirmedOn)}</div>
                  </td>
                  <td className="py-1.5 text-neutral-600">{l.memberName}</td>
                  <td className="py-1.5">{AGENCY_DEAL_TYPES[l.commission.dealType].label}</td>
                  <td className="tabular py-1.5 text-right">{formatJPY(l.commission.baseAmount)}</td>
                  <td className="tabular py-1.5 text-right">{formatPercent(l.commission.rate, 0)}</td>
                  <td className="tabular py-1.5 text-right font-medium">{formatJPY(l.commission.amount)}</td>
                </tr>
              ))}
              {statement.lines.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-3 text-center text-neutral-500">
                    対象月に支払対象になった報酬はありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="mt-6 flex justify-end">
            <div className="w-72 space-y-1.5 text-sm">
              <div className="flex justify-between text-neutral-600">
                <span>うち支払済</span>
                <span className="tabular">{formatJPY(statement.paidTotal)}</span>
              </div>
              <div className="flex justify-between border-t-2 border-neutral-800 pt-2 text-base font-bold">
                <span>お支払金額</span>
                <span className="tabular">{formatJPY(statement.total)}</span>
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-md border border-neutral-200 bg-neutral-50 p-4 text-xs text-neutral-600">
            ※ 報酬はお客様の初期費用（税抜）に区分ごとの率（取次型 50% / 営業・初期設定型 100%）を掛けて算出しています。
            お客様の初期費用のご入金を確認した月の明細に計上しています。内容に相違がある場合は1週間以内にご連絡ください。
          </div>
        </div>
      </div>
    </div>
  );
}
