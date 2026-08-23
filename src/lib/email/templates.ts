import type { AgencyStatement } from "@/lib/domain/agency";
import { paymentMethodLabels } from "@/lib/domain/constants";
import type { Contract, Invoice, Organization } from "@/lib/domain/types";
import { formatDate, formatDateTime, formatJPY, formatPercent } from "@/lib/utils";

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

/**
 * 入金督促(リマインド)メールの本文(HTML)。
 * 支払期限を過ぎた請求について、行き違いを考慮した丁寧な文面で残額と振込先を案内する。
 */
export function paymentReminderEmailHtml(params: {
  invoice: Invoice;
  customerName: string;
  org: Organization;
  /** 期限からの経過日数(期限内なら 0 以下) */
  overdueDays: number;
}): string {
  const { invoice, customerName, org, overdueDays } = params;
  const remain = Math.max(0, invoice.total - invoice.amountPaid);

  const bankInfo =
    invoice.paymentMethod !== "direct_debit" && org.bankName
      ? `<p style="margin:4px 0;color:#555">お振込先: ${escapeHtml(org.bankName)} ${escapeHtml(org.bankBranch)} ${escapeHtml(org.bankAccountType)} ${escapeHtml(org.bankAccountNumber)} ${escapeHtml(org.bankAccountHolder)}</p>`
      : "";

  const lead =
    overdueDays > 0
      ? `お支払期限（${formatDate(invoice.dueDate)}）を過ぎておりますが、下記のご請求についてご入金の確認ができておりません。`
      : `下記のご請求について、お支払期限（${formatDate(invoice.dueDate)}）が近づいておりますのでご案内申し上げます。`;

  return `
  <div style="font-family:'Hiragino Sans','Noto Sans JP',sans-serif;max-width:600px;margin:0 auto;color:#152a26">
    <div style="background:#0d3b33;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0;border-bottom:3px solid #c2a15c">
      <div style="font-size:13px;color:#c2a15c">${escapeHtml(org.name)}</div>
      <div style="font-size:20px;font-weight:700;margin-top:2px">お支払いのご確認（ご案内）</div>
    </div>
    <div style="border:1px solid #eee;border-top:none;padding:24px;border-radius:0 0 12px 12px">
      <p>${escapeHtml(customerName)} 様</p>
      <p>いつもご利用いただきありがとうございます。${lead}</p>
      <div style="background:#f1f6f4;border-radius:8px;padding:12px 16px;margin-top:16px;font-size:14px;border-left:3px solid #c2a15c">
        <div>請求書番号: ${invoice.invoiceNumber}</div>
        <div>発行日: ${formatDate(invoice.issueDate)} / 支払期限: ${formatDate(invoice.dueDate)}</div>
        <div style="margin-top:8px;font-size:18px;font-weight:700">お支払い残額 ${formatJPY(remain)}</div>
        ${bankInfo}
      </div>
      <p style="margin-top:16px">
        本メールと行き違いでご入金いただいている場合は、何卒ご容赦ください。<br />
        ご不明な点がございましたら、本メールへご返信いただくかお電話にてお問い合わせください。
      </p>
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

/** 営業代理店向けの月次支払明細メール。 */
export function agencyStatementEmailHtml(params: {
  statement: AgencyStatement;
  org: Organization;
}): string {
  const { statement, org } = params;
  const [y, m] = statement.month.split("-");
  const monthLabel = `${y}年${Number(m)}月`;

  const memberRows = statement.members
    .map(
      (mem) => `
      <tr>
        <td style="padding:8px 4px;border-bottom:1px solid #eee">${escapeHtml(mem.memberName)}</td>
        <td style="padding:8px 4px;border-bottom:1px solid #eee;text-align:right">${mem.customerCount}件</td>
        <td style="padding:8px 4px;border-bottom:1px solid #eee;text-align:right">${formatJPY(mem.paidSubtotal)}</td>
        <td style="padding:8px 4px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${formatJPY(mem.commission)}</td>
      </tr>`,
    )
    .join("");

  const lineRows = statement.lines
    .map(
      (l) => `
      <tr>
        <td style="padding:6px 4px;border-bottom:1px solid #f2f2f2;font-size:12px">${escapeHtml(l.customerName)}</td>
        <td style="padding:6px 4px;border-bottom:1px solid #f2f2f2;font-size:12px">${escapeHtml(l.memberName)}</td>
        <td style="padding:6px 4px;border-bottom:1px solid #f2f2f2;font-size:12px;text-align:right">${formatJPY(l.subtotal)}</td>
        <td style="padding:6px 4px;border-bottom:1px solid #f2f2f2;font-size:12px;text-align:right">${l.paid ? "入金済" : "未入金(対象外)"}</td>
      </tr>`,
    )
    .join("");

  return `
  <div style="font-family:'Hiragino Sans','Noto Sans JP',sans-serif;max-width:640px;margin:0 auto;color:#152a26">
    <div style="background:#0d3b33;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0;border-bottom:3px solid #c2a15c">
      <div style="font-size:13px;color:#c2a15c">${escapeHtml(org.name)}</div>
      <div style="font-size:20px;font-weight:700;margin-top:2px">${monthLabel}分 支払明細のご案内</div>
    </div>
    <div style="border:1px solid #eee;border-top:none;padding:24px;border-radius:0 0 12px 12px">
      <p>${escapeHtml(statement.agency.name)}<br/>${escapeHtml(statement.agency.contactName)} 様</p>
      <p>いつもお世話になっております。${monthLabel}分の紹介手数料の明細をお送りします。</p>

      <div style="background:#f1f6f4;border-radius:8px;padding:14px 18px;margin:16px 0;border-left:3px solid #c2a15c">
        <div style="font-size:13px;color:#555">お支払金額（税抜売上 ${formatJPY(statement.paidSubtotal)} × 手数料率 ${formatPercent(statement.agency.commissionRate, 0)}）</div>
        <div style="font-size:24px;font-weight:700;margin-top:4px">${formatJPY(statement.commission)}</div>
      </div>

      <h3 style="font-size:14px;margin:16px 0 6px">営業担当別の内訳</h3>
      <table style="width:100%;border-collapse:collapse">
        <tr style="font-size:12px;color:#888;text-align:left">
          <th style="padding:4px">営業担当</th><th style="padding:4px;text-align:right">顧客数</th>
          <th style="padding:4px;text-align:right">入金済売上(税抜)</th><th style="padding:4px;text-align:right">支払額</th>
        </tr>
        ${memberRows}
      </table>

      <h3 style="font-size:14px;margin:18px 0 6px">明細（対象請求）</h3>
      <table style="width:100%;border-collapse:collapse">
        <tr style="font-size:11px;color:#888;text-align:left">
          <th style="padding:4px">顧客</th><th style="padding:4px">営業担当</th>
          <th style="padding:4px;text-align:right">金額(税抜)</th><th style="padding:4px;text-align:right">入金状況</th>
        </tr>
        ${lineRows}
      </table>

      <p style="color:#777;font-size:12px;margin-top:16px">
        ※ 支払額は入金済み売上(税抜)に手数料率を乗じて算出しています。未入金分は入金確認後の明細に計上されます。<br/>
        ※ 内容に相違がある場合は、お手数ですが1週間以内にご連絡ください。
      </p>
      <p style="color:#999;font-size:12px;margin-top:16px">${escapeHtml(org.name)}　${escapeHtml(org.address)}　${org.tel}</p>
    </div>
  </div>`;
}

/** 設定確認用のテスト送信メール。 */
export function testEmailHtml(params: {
  org: Organization;
  actor: string;
  sentAt: string;
}): string {
  const { org, actor, sentAt } = params;
  return `
  <div style="font-family:'Hiragino Sans','Noto Sans JP',sans-serif;max-width:600px;margin:0 auto;color:#152a26">
    <div style="background:#0d3b33;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0;border-bottom:3px solid #c2a15c">
      <div style="font-size:13px;color:#c2a15c">${escapeHtml(org.name)}</div>
      <div style="font-size:20px;font-weight:700;margin-top:2px">メール送信テスト</div>
    </div>
    <div style="border:1px solid #eee;border-top:none;padding:24px;border-radius:0 0 12px 12px">
      <p>このメールが届いていれば、契約書の署名依頼・請求書・代理店明細のメールが<strong>実際に送信できる状態</strong>です。</p>
      <div style="background:#f1f6f4;border-radius:8px;padding:12px 16px;margin-top:16px;font-size:14px;border-left:3px solid #c2a15c">
        <div>送信日時: ${formatDateTime(sentAt)}</div>
        <div>実行者: ${escapeHtml(actor)}</div>
      </div>
      <p style="color:#777;font-size:12px;margin-top:20px">
        設定画面の「メール送信」から送信したテストメールです。お客様へは送信されていません。
      </p>
      <p style="color:#999;font-size:12px;margin-top:16px">${escapeHtml(org.name)}　${escapeHtml(org.address)}　${org.tel}</p>
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
