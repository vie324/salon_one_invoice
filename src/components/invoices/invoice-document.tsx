import { LogoMark } from "@/components/brand/logo";
import { calcInvoiceTotals, formatBillingPeriod } from "@/lib/domain/calculations";
import { invoiceTypeLabels, paymentMethodLabels } from "@/lib/domain/constants";
import type { Customer, Invoice, Organization } from "@/lib/domain/types";
import { formatDate, formatJPY } from "@/lib/utils";

/** 請求書の書面表示(画面プレビュー / 印刷PDF 共通)。 */
export function InvoiceDocument({
  invoice,
  customer,
  org,
}: {
  invoice: Invoice;
  customer: Customer;
  org: Organization;
}) {
  const totals = calcInvoiceTotals(invoice.items);
  return (
    <div className="print-container mx-auto max-w-3xl rounded-lg border border-border bg-white p-8 text-[13px] text-neutral-900 shadow-sm sm:p-10">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-wide text-neutral-900">請求書</h1>
          <p className="mt-1 text-neutral-500">INVOICE</p>
        </div>
        <div className="text-right text-xs text-neutral-600">
          <div className="tabular">No. {invoice.invoiceNumber}</div>
          <div>発行日： {formatDate(invoice.issueDate)}</div>
          <div>支払期限： {formatDate(invoice.dueDate)}</div>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-8 sm:flex-row sm:justify-between">
        {/* 宛先 */}
        <div className="flex-1">
          <div className="text-lg font-semibold text-neutral-900">{customer.name} 御中</div>
          {customer.postalCode && (
            <div className="mt-2 text-neutral-600">〒{customer.postalCode}</div>
          )}
          <div className="text-neutral-600">{customer.address}</div>
          {customer.contactName && customer.contactName !== customer.name && (
            <div className="mt-1 text-neutral-600">ご担当： {customer.contactName} 様</div>
          )}
          <div className="mt-6 inline-flex flex-col rounded-md bg-neutral-50 px-4 py-3">
            <span className="text-xs text-neutral-500">ご請求金額（税込）</span>
            <span className="tabular text-2xl font-bold text-neutral-900">
              {formatJPY(invoice.total)}
            </span>
            {invoice.billingPeriod && (
              <span className="mt-0.5 text-xs text-neutral-500">
                {formatBillingPeriod(invoice.billingPeriod)}
              </span>
            )}
          </div>
        </div>

        {/* 発行元 */}
        <div className="text-neutral-700 sm:text-right">
          <div className="flex items-center gap-2 sm:justify-end">
            <LogoMark size={34} />
            <span className="font-semibold text-neutral-900">{org.name}</span>
          </div>
          <div className="mt-2 text-xs leading-relaxed">
            〒{org.postalCode} {org.address}
            <br />
            TEL: {org.tel}
            <br />
            {org.email}
            <br />
            登録番号: {org.registrationNumber}
          </div>
        </div>
      </div>

      {/* 明細 */}
      <table className="mt-8 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-neutral-800 text-xs text-neutral-500">
            <th className="py-2 text-left font-medium">品目</th>
            <th className="py-2 text-right font-medium">数量</th>
            <th className="py-2 text-right font-medium">単価</th>
            <th className="py-2 text-right font-medium">税率</th>
            <th className="py-2 text-right font-medium">金額</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((it) => (
            <tr key={it.id} className="border-b border-neutral-200">
              <td className="py-2.5 text-neutral-900">{it.description}</td>
              <td className="tabular py-2.5 text-right text-neutral-700">{it.quantity}</td>
              <td className="tabular py-2.5 text-right text-neutral-700">{formatJPY(it.unitPrice)}</td>
              <td className="tabular py-2.5 text-right text-neutral-500">{Math.round(it.taxRate * 100)}%</td>
              <td className="tabular py-2.5 text-right font-medium text-neutral-900">{formatJPY(it.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 合計 */}
      <div className="mt-4 flex justify-end">
        <div className="w-64 space-y-1.5 text-sm">
          <div className="flex justify-between text-neutral-600">
            <span>小計</span>
            <span className="tabular">{formatJPY(totals.subtotal)}</span>
          </div>
          {totals.taxBreakdown.map((b) => (
            <div key={b.rate} className="flex justify-between text-neutral-600">
              <span>消費税（{Math.round(b.rate * 100)}%）</span>
              <span className="tabular">{formatJPY(b.tax)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t-2 border-neutral-800 pt-2 text-base font-bold text-neutral-900">
            <span>合計</span>
            <span className="tabular">{formatJPY(invoice.total)}</span>
          </div>
        </div>
      </div>

      {/* 支払方法・備考 */}
      <div className="mt-8 rounded-md border border-neutral-200 bg-neutral-50 p-4 text-xs text-neutral-600">
        <div className="font-medium text-neutral-800">
          お支払い方法： {paymentMethodLabels[invoice.paymentMethod]}（{invoiceTypeLabels[invoice.type]}）
        </div>
        {invoice.paymentMethod === "bank_transfer" && (
          <div className="mt-1">
            お振込先： {org.bankName} {org.bankBranch} {org.bankAccountType}{" "}
            {org.bankAccountNumber} {org.bankAccountHolder}
          </div>
        )}
        {invoice.paymentMethod === "direct_debit" && (
          <div className="mt-1">
            ご登録の口座より {formatDate(invoice.dueDate)} に引き落とさせていただきます。
          </div>
        )}
        {invoice.notes && <div className="mt-2 whitespace-pre-wrap">{invoice.notes}</div>}
      </div>
    </div>
  );
}
