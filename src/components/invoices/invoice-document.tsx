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
  // 振込払いの案内に載せる口座情報(未設定の項目は行ごと省く)
  const bankRows = [
    { label: "銀行名", value: org.bankName },
    { label: "支店名", value: org.bankBranch },
    { label: "支店番号", value: org.bankBranchCode },
    { label: "預金種別", value: org.bankAccountType },
    { label: "口座番号", value: org.bankAccountNumber },
    { label: "口座名義", value: org.bankAccountHolder },
  ].filter((row) => Boolean(row.value));
  return (
    <div className="print-container mx-auto max-w-3xl rounded-lg border border-border bg-white p-4 text-[13px] text-neutral-900 shadow-sm sm:p-8 md:p-10">
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
          {/* 未入力の項目はラベルごと省く(空の「TEL:」等を印字しない) */}
          <div className="mt-2 text-xs leading-relaxed">
            {org.postalCode && <>〒{org.postalCode} </>}
            {org.address}
            {org.tel && (
              <>
                <br />
                TEL: {org.tel}
              </>
            )}
            {org.email && (
              <>
                <br />
                {org.email}
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

      {/* 明細 */}
      <div className="mt-8 overflow-x-auto">
      <table className="w-full min-w-[440px] border-collapse text-sm">
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
      </div>

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

      {/* 支払方法・備考 — 支払方法に応じて引き落とし / お振込みの案内を出し分ける */}
      <div className="mt-8 rounded-md border border-neutral-200 bg-neutral-50 p-4 text-xs text-neutral-600">
        <div className="font-medium text-neutral-800">
          お支払い方法： {paymentMethodLabels[invoice.paymentMethod]}（{invoiceTypeLabels[invoice.type]}）
        </div>
        {invoice.paymentMethod === "direct_debit" && (
          <div className="mt-1">
            ご登録の口座より {formatDate(invoice.dueDate)} に引き落とさせていただきます。
          </div>
        )}
        {invoice.paymentMethod === "bank_transfer" && (
          <>
            <div className="mt-1">
              {formatDate(invoice.dueDate)} までに下記口座へお振込みくださいますよう、
              よろしくお願いいたします。
            </div>
            {bankRows.length > 0 && (
              <div className="mt-2">
                <div className="font-medium text-neutral-800">【お振込先】</div>
                <dl className="mt-1 space-y-0.5">
                  {bankRows.map((row) => (
                    <div key={row.label} className="flex gap-1">
                      <dt className="w-14 shrink-0">{row.label}</dt>
                      <dd className="text-neutral-700">： {row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </>
        )}
        {invoice.notes && <div className="mt-2 whitespace-pre-wrap">{invoice.notes}</div>}
      </div>
    </div>
  );
}
