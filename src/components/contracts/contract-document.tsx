import type { Contract, ContractFeeTable } from "@/lib/domain/types";
import { formatDate, formatDateTime } from "@/lib/utils";

const FEE_TABLE_TOKEN = "{{料金表}}";

function FeeTables({ tables }: { tables: ContractFeeTable[] }) {
  if (tables.length === 0) return null;
  return (
    <div className="my-4 space-y-4">
      {tables.map((table, ti) => (
        <div key={ti}>
          <div className="mb-1 text-[13px] font-semibold text-neutral-900">{table.title}</div>
          <table className="w-full border-collapse border border-neutral-300 text-[12px]">
            <thead>
              <tr className="bg-neutral-100 text-neutral-700">
                <th className="border border-neutral-300 px-3 py-1.5 text-left font-medium w-[40%]">
                  項目
                </th>
                <th className="border border-neutral-300 px-3 py-1.5 text-left font-medium">
                  金額（税別）
                </th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, ri) => (
                <tr key={ri}>
                  <td className="border border-neutral-300 px-3 py-1.5 text-neutral-900">
                    {row.item}
                  </td>
                  <td className="border border-neutral-300 px-3 py-1.5 text-neutral-800">
                    {row.amount}
                    {row.note && (
                      <span className="ml-2 text-[11px] text-neutral-500">{row.note}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

/** 条文本文。{{料金表}} プレースホルダの位置に料金表(別表)を差し込む。 */
function SectionBody({ body, feeTables }: { body: string; feeTables: ContractFeeTable[] }) {
  const parts = body.split(FEE_TABLE_TOKEN);
  return (
    <>
      {parts.map((part, i) => (
        <div key={i}>
          {part.trim() && (
            <p className="whitespace-pre-wrap leading-relaxed text-neutral-800">{part.trim()}</p>
          )}
          {i < parts.length - 1 && <FeeTables tables={feeTables} />}
        </div>
      ))}
    </>
  );
}

/**
 * 契約書の書面表示(署名ページ / 印刷PDF / プレビュー共通)。
 * 本文に {{料金表}} が無い場合、料金表は末尾に「別表」として描画する。
 */
export function ContractDocument({ contract }: { contract: Contract }) {
  const hasFeeToken = contract.sections.some((s) => s.body.includes(FEE_TABLE_TOKEN));
  const signed = contract.status === "signed";

  return (
    <div className="print-container mx-auto max-w-3xl rounded-lg border border-border bg-white p-4 text-[13px] text-neutral-900 shadow-sm sm:p-8 md:p-10">
      {/* 表題 */}
      <div className="text-center">
        <h1 className="text-xl font-bold tracking-wide text-neutral-900 sm:text-2xl">
          {contract.title}
        </h1>
        <div className="tabular mt-2 text-xs text-neutral-500">
          契約書番号: {contract.contractNumber}
        </div>
      </div>

      {/* 前文 */}
      {contract.preamble && (
        <p className="mt-6 whitespace-pre-wrap leading-relaxed text-neutral-800">
          {contract.preamble}
        </p>
      )}

      {/* 条文 */}
      <div className="mt-6 space-y-5">
        {contract.sections.map((section, i) => (
          <section key={i}>
            <h2 className="mb-1.5 font-bold text-neutral-900">{section.title}</h2>
            <SectionBody body={section.body} feeTables={contract.feeTables} />
          </section>
        ))}
      </div>

      {/* 料金表(本文に差し込み位置が無い場合は別表として末尾に) */}
      {!hasFeeToken && contract.feeTables.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-2 font-bold text-neutral-900">別表（利用料金）</h2>
          <FeeTables tables={contract.feeTables} />
        </div>
      )}

      {/* 申込内容 */}
      {(contract.terms.planName || contract.terms.notes) && (
        <div className="mt-8 rounded-md border border-neutral-200 bg-neutral-50 p-4 text-xs text-neutral-700">
          <div className="mb-1 font-semibold text-neutral-800">お申込み内容</div>
          {contract.terms.planName && <div>プラン: {contract.terms.planName}</div>}
          {contract.terms.storeCount > 0 && <div>契約店舗数: {contract.terms.storeCount}店舗</div>}
          {contract.terms.startDate && (
            <div>利用開始日(予定): {formatDate(contract.terms.startDate)}</div>
          )}
          {contract.terms.notes && (
            <div className="mt-1 whitespace-pre-wrap">{contract.terms.notes}</div>
          )}
        </div>
      )}

      {/* 署名欄 */}
      <div className="mt-10 border-t-2 border-neutral-800 pt-6">
        <h2 className="font-bold text-neutral-900">署名欄</h2>
        <p className="mt-2 leading-relaxed text-neutral-800">
          本契約の成立を証するため、本書を作成し、甲乙双方の合意の記録（電子署名を含む。）をもって、
          書面への記名押印に代えるものとする。甲および乙は、本契約が電磁的記録により締結されること、
          ならびに当該電磁的記録および付随する締結証跡が本契約成立の証拠となることに異議なく同意する。
        </p>

        <div className="tabular mt-4 text-neutral-800">
          締結日: {signed && contract.signedAt ? formatDate(contract.signedAt) : "＿＿＿＿年＿＿月＿＿日"}
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {/* 甲 */}
          <div className="rounded-md border border-neutral-200 p-4">
            <div className="text-xs font-semibold text-neutral-500">【甲】サービス提供者</div>
            <div className="mt-2 space-y-1 text-neutral-800">
              {contract.provider.address && <div>住所: {contract.provider.address}</div>}
              <div className="font-semibold text-neutral-900">{contract.provider.name}</div>
              {contract.provider.representative && (
                <div>{contract.provider.representative}</div>
              )}
            </div>
            {signed && (
              <div className="mt-3 inline-block rounded border border-emerald-700 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                電子契約により締結（送信者として合意）
              </div>
            )}
          </div>

          {/* 乙 */}
          <div className="rounded-md border border-neutral-200 p-4">
            <div className="text-xs font-semibold text-neutral-500">【乙】契約者</div>
            <div className="mt-2 space-y-1 text-neutral-800">
              <div>
                住所: {contract.customerParty.address || "＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿"}
              </div>
              <div className="font-semibold text-neutral-900">
                {contract.customerParty.name || "＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿"}
              </div>
              <div>
                代表者: {signed ? contract.signerName : contract.customerParty.representative || "＿＿＿＿＿＿＿＿＿＿＿＿"}
              </div>
            </div>
            {signed && contract.signedAt && (
              <div className="mt-3 rounded border border-emerald-700 px-2 py-1 text-[11px] text-emerald-700">
                <div className="font-semibold">電子署名済み</div>
                <div className="tabular">署名者: {contract.signerName}</div>
                <div className="tabular">日時: {formatDateTime(contract.signedAt)}</div>
              </div>
            )}
          </div>
        </div>

        {/* 契約内容の同一性を示すハッシュ(送付時に固定) */}
        {contract.contentHash && (
          <div className="mt-6 break-all text-[10px] text-neutral-400">
            契約内容ハッシュ(SHA-256): {contract.contentHash}
          </div>
        )}
      </div>
    </div>
  );
}
