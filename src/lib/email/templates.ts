import { paymentMethodLabels } from "@/lib/domain/constants";
import type { Invoice, Organization } from "@/lib/domain/types";
import { formatDate, formatJPY } from "@/lib/utils";

/** 請求書送付メールの本文(HTML)。 */
export function invoiceEmailHtml(params: {
  invoice: Invoice;
  customerName: string;
  org: Organization;
  viewUrl?: string;
}): string {
  const { invoice, customerName, org, viewUrl } = params;
  const rows = invoice.items
    .map(
      (it) => `
      <tr>
        <td style="padding:8px 4px;border-bottom:1px solid #eee">${escapeHtml(it.description)}</td>
        <td style="padding:8px 4px;border-bottom:1px solid #eee;text-align:right">${it.quantity}</td>
        <td style="padding:8px 4px;border-bottom:1px solid #eee;text-align:right">${formatJPY(it.unitPrice)}</td>
        <td style="padding:8px 4px;border-bottom:1px solid #eee;text-align:right">${formatJPY(it.amount)}</td>
      </tr>`,
    )
    .join("");

  const payLine =
    invoice.paymentMethod === "direct_debit"
      ? `お支払いは <strong>口座振替</strong> にて ${formatDate(invoice.dueDate)} に引き落としの予定です。`
      : `お支払いは <strong>${paymentMethodLabels[invoice.paymentMethod]}</strong> にて ${formatDate(invoice.dueDate)} までにお願いいたします。`;

  const bankInfo =
    invoice.paymentMethod === "bank_transfer"
      ? `<p style="margin:4px 0;color:#555">お振込先: ${org.bankName} ${org.bankBranch} ${org.bankAccountType} ${org.bankAccountNumber} ${org.bankAccountHolder}</p>`
      : "";

  return `
  <div style="font-family:'Hiragino Sans','Noto Sans JP',sans-serif;max-width:600px;margin:0 auto;color:#152a26">
    <div style="background:#0d3b33;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0;border-bottom:3px solid #c2a15c">
      <div style="font-size:13px;color:#c2a15c">${escapeHtml(org.name)}</div>
      <div style="font-size:20px;font-weight:700;margin-top:2px">請求書のご案内</div>
    </div>
    <div style="border:1px solid #eee;border-top:none;padding:24px;border-radius:0 0 12px 12px">
      <p>${escapeHtml(customerName)} 様</p>
      <p>いつもご利用いただきありがとうございます。下記のとおりご請求申し上げます。</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr style="font-size:12px;color:#888;text-align:left">
          <th style="padding:4px">品目</th><th style="padding:4px;text-align:right">数量</th>
          <th style="padding:4px;text-align:right">単価</th><th style="padding:4px;text-align:right">金額</th>
        </tr>
        ${rows}
      </table>
      <div style="text-align:right">
        <div style="color:#666;font-size:13px">小計 ${formatJPY(invoice.subtotal)} / 消費税 ${formatJPY(invoice.taxTotal)}</div>
        <div style="font-size:22px;font-weight:700;margin-top:4px">合計 ${formatJPY(invoice.total)}</div>
      </div>
      <div style="background:#f1f6f4;border-radius:8px;padding:12px 16px;margin-top:16px;font-size:14px;border-left:3px solid #c2a15c">
        <div>請求書番号: ${invoice.invoiceNumber}</div>
        <div>発行日: ${formatDate(invoice.issueDate)} / 支払期限: ${formatDate(invoice.dueDate)}</div>
        <p style="margin:8px 0 0">${payLine}</p>
        ${bankInfo}
      </div>
      ${
        viewUrl
          ? `<div style="text-align:center;margin-top:20px"><a href="${viewUrl}" style="background:#0d3b33;color:#fff;text-decoration:none;padding:10px 24px;border-radius:8px;display:inline-block">請求書を表示</a></div>`
          : ""
      }
      <p style="color:#999;font-size:12px;margin-top:24px">${escapeHtml(org.name)}　${escapeHtml(org.address)}　${org.tel}</p>
    </div>
  </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
