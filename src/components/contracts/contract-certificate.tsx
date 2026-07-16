import { ShieldCheck } from "lucide-react";
import type { Contract, ContractEvent, Organization } from "@/lib/domain/types";
import { contractEventLabels } from "@/lib/domain/constants";
import { formatDateTime } from "@/lib/utils";

/**
 * 締結証明書。
 * 誰が・いつ・どの内容(ハッシュ)に・どの経路で同意したかの証跡を書面化する。
 * 電子署名法上の「本人による一定の措置」を裏付ける証拠書類として、
 * 契約書PDFとあわせて双方が保管することを想定。
 */
export function ContractCertificate({
  contract,
  events,
  org,
}: {
  contract: Contract;
  events: ContractEvent[];
  org: Organization;
}) {
  return (
    <div className="print-container mx-auto max-w-3xl rounded-lg border border-border bg-white p-8 text-[13px] text-neutral-900 shadow-sm sm:p-10">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-neutral-900">
            <ShieldCheck className="h-6 w-6 text-emerald-700" />
            締結証明書
          </h1>
          <p className="mt-1 text-xs text-neutral-500">Certificate of Completion</p>
        </div>
        <div className="text-right text-xs text-neutral-600">
          <div className="tabular">契約書番号: {contract.contractNumber}</div>
          <div>発行者: {org.name}</div>
        </div>
      </div>

      <div className="mt-6 rounded-md border border-neutral-200 bg-neutral-50 p-4 text-xs leading-relaxed text-neutral-700">
        本証明書は、下記の契約が電子的手段により締結されたこと、およびその締結過程の証跡を証明するものです。
        契約内容は送付時に SHA-256 ハッシュ値により固定化され、署名時に同一性が検証されています。
      </div>

      {/* 契約情報 */}
      <table className="mt-6 w-full border-collapse text-sm">
        <tbody>
          {[
            ["契約書名", contract.title],
            ["契約書番号", contract.contractNumber],
            ["甲（サービス提供者）", `${contract.provider.name}　${contract.provider.representative}`],
            ["乙（契約者）", `${contract.customerParty.name}　${contract.customerParty.representative}`],
            ["署名者", contract.signerName || "—"],
            ["署名者メールアドレス", contract.signerEmail || "—"],
            ["送付日時", formatDateTime(contract.sentAt)],
            ["初回閲覧日時", formatDateTime(contract.firstViewedAt)],
            ["締結日時", formatDateTime(contract.signedAt)],
            ["署名時IPアドレス", contract.signerIp || "—"],
            ["署名時端末情報", contract.signerUserAgent || "—"],
            ["本人確認", `メールアドレス宛の専用リンク${contract.accessCode ? " + アクセスコード(別経路伝達)" : ""}`],
          ].map(([label, value]) => (
            <tr key={label} className="border-b border-neutral-200">
              <th className="w-44 py-2 pr-4 text-left align-top text-xs font-medium text-neutral-500">
                {label}
              </th>
              <td className="tabular break-all py-2 text-neutral-900">{value}</td>
            </tr>
          ))}
          <tr className="border-b border-neutral-200">
            <th className="w-44 py-2 pr-4 text-left align-top text-xs font-medium text-neutral-500">
              契約内容ハッシュ
              <br />
              (SHA-256)
            </th>
            <td className="tabular break-all py-2 text-neutral-900">
              {contract.contentHash || "—"}
            </td>
          </tr>
        </tbody>
      </table>

      {/* 証跡タイムライン */}
      <h2 className="mt-8 font-bold text-neutral-900">締結証跡（監査ログ）</h2>
      <p className="mt-1 text-xs text-neutral-500">
        全イベントは追記専用の監査ログに記録され、変更・削除はシステム上禁止されています。
      </p>
      <table className="mt-3 w-full border-collapse text-xs">
        <thead>
          <tr className="border-b-2 border-neutral-800 text-neutral-500">
            <th className="py-1.5 pr-3 text-left font-medium">日時</th>
            <th className="py-1.5 pr-3 text-left font-medium">イベント</th>
            <th className="py-1.5 pr-3 text-left font-medium">実施者</th>
            <th className="py-1.5 pr-3 text-left font-medium">IPアドレス</th>
            <th className="py-1.5 text-left font-medium">詳細</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className="border-b border-neutral-200 align-top">
              <td className="tabular whitespace-nowrap py-1.5 pr-3 text-neutral-700">
                {formatDateTime(e.createdAt)}
              </td>
              <td className="py-1.5 pr-3 font-medium text-neutral-900">
                {contractEventLabels[e.type]}
              </td>
              <td className="py-1.5 pr-3 text-neutral-700">{e.actor || "—"}</td>
              <td className="tabular py-1.5 pr-3 text-neutral-700">{e.ip || "—"}</td>
              <td className="py-1.5 text-neutral-600">
                {e.detail}
                {e.contentHash && (
                  <div className="break-all text-[10px] text-neutral-400">
                    hash: {e.contentHash}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-8 text-[10px] leading-relaxed text-neutral-400">
        本電子契約は、当事者双方の合意に基づき電磁的記録により締結されたものです。
        契約内容の同一性は SHA-256 ハッシュ値により検証できます。
        本証明書は {org.name} の電子契約システムにより自動生成されました。
      </div>
    </div>
  );
}
