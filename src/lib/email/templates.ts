import { paymentMethodLabels } from "@/lib/domain/constants";
import type { Contract, Invoice, Organization } from "@/lib/domain/types";
import { formatDate, formatDateTime, formatJPY } from "@/lib/utils";

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

/** 電子契約の署名依頼メール(初回送付・リマインド共用)。 */
export function contractSignRequestEmailHtml(params: {
  contract: Contract;
  org: Organization;
  signUrl: string;
  isReminder?: boolean;
}): string {
  const { contract, org, isReminder } = params;
  const signUrl = escapeHtml(params.signUrl);
  const hasCode = !!contract.accessCode;
  return `
  <div style="font-family:'Hiragino Sans','Noto Sans JP',sans-serif;max-width:600px;margin:0 auto;color:#152a26">
    <div style="background:#0d3b33;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0;border-bottom:3px solid #c2a15c">
      <div style="font-size:13px;color:#c2a15c">${escapeHtml(org.name)}</div>
      <div style="font-size:20px;font-weight:700;margin-top:2px">${isReminder ? "【リマインド】" : ""}電子契約のご署名のお願い</div>
    </div>
    <div style="border:1px solid #eee;border-top:none;padding:24px;border-radius:0 0 12px 12px">
      <p>${escapeHtml(contract.customerParty.name)}<br/>${escapeHtml(contract.customerParty.representative)} 様</p>
      <p>${escapeHtml(org.name)} より「${escapeHtml(contract.title)}」の内容確認と電子署名のご依頼をお送りします。下記のボタンから契約内容をご確認のうえ、ご同意(電子署名)をお願いいたします。</p>
      <div style="background:#f1f6f4;border-radius:8px;padding:12px 16px;margin-top:16px;font-size:14px;border-left:3px solid #c2a15c">
        <div>契約書番号: ${escapeHtml(contract.contractNumber)}</div>
        ${contract.expiresAt ? `<div>署名期限: ${formatDateTime(contract.expiresAt)}</div>` : ""}
        ${hasCode ? `<div style="margin-top:8px"><strong>アクセスコードが設定されています。</strong>コードは担当者より別途(お電話等で)お伝えします。メールには記載されません。</div>` : ""}
      </div>
      <div style="text-align:center;margin-top:20px">
        <a href="${signUrl}" style="background:#0d3b33;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;display:inline-block;font-weight:600">契約内容を確認して署名する</a>
      </div>
      <p style="color:#777;font-size:12px;margin-top:20px">
        このリンクはお客様専用です。第三者への転送はお控えください。<br/>
        ご署名の際は、閲覧・同意の日時、IPアドレス等が締結の証跡として記録されます。<br/>
        本メールに心当たりがない場合は、破棄していただきますようお願いいたします。
      </p>
      <p style="color:#999;font-size:12px;margin-top:16px">${escapeHtml(org.name)}　${escapeHtml(org.address)}　${org.tel}</p>
    </div>
  </div>`;
}

/** 締結完了通知メール(契約者・自社の双方に送付)。 */
export function contractSignedEmailHtml(params: {
  contract: Contract;
  org: Organization;
  signUrl: string;
}): string {
  const { contract, org } = params;
  const signUrl = escapeHtml(params.signUrl);
  return `
  <div style="font-family:'Hiragino Sans','Noto Sans JP',sans-serif;max-width:600px;margin:0 auto;color:#152a26">
    <div style="background:#0d3b33;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0;border-bottom:3px solid #c2a15c">
      <div style="font-size:13px;color:#c2a15c">${escapeHtml(org.name)}</div>
      <div style="font-size:20px;font-weight:700;margin-top:2px">電子契約 締結完了のお知らせ</div>
    </div>
    <div style="border:1px solid #eee;border-top:none;padding:24px;border-radius:0 0 12px 12px">
      <p>「${escapeHtml(contract.title)}」の締結が完了しました。</p>
      <div style="background:#f1f6f4;border-radius:8px;padding:12px 16px;margin-top:12px;font-size:14px;border-left:3px solid #c2a15c">
        <div>契約書番号: ${escapeHtml(contract.contractNumber)}</div>
        <div>契約者: ${escapeHtml(contract.customerParty.name)}（署名者: ${escapeHtml(contract.signerName)}）</div>
        <div>締結日時: ${formatDateTime(contract.signedAt)}</div>
        <div style="word-break:break-all">内容ハッシュ(SHA-256): ${escapeHtml(contract.contentHash ?? "")}</div>
      </div>
      <p style="margin-top:16px;font-size:14px">
        締結済みの契約書と締結証明書は、下記リンクからいつでも確認・保存(PDF)できます。
        双方で保管をお願いいたします。
      </p>
      <div style="text-align:center;margin-top:16px">
        <a href="${signUrl}" style="background:#0d3b33;color:#fff;text-decoration:none;padding:10px 24px;border-radius:8px;display:inline-block">締結済み契約書を表示</a>
      </div>
      <p style="color:#999;font-size:12px;margin-top:20px">${escapeHtml(org.name)}　${escapeHtml(org.address)}　${org.tel}</p>
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
