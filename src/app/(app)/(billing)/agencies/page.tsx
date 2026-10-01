import { Handshake, Info } from "lucide-react";
import Link from "next/link";
import { DealTypeBadge } from "@/components/orders/order-ui";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getServiceRepository } from "@/lib/data";
import {
  agencyCommissionAmount,
  agencyCommissionLines,
  agencyRateLabel,
  computeAgencyStatement,
  summarizeAgencyCommissions,
} from "@/lib/domain/agency";
import { AGENCY_DEAL_TYPE_KEYS, AGENCY_DEAL_TYPES } from "@/lib/domain/constants";
import { currentMonth, formatJPY } from "@/lib/utils";
import { NewAgencyButton } from "./new-agency-button";

export const metadata = { title: "代理店" };

// 一覧はデータ依存のため常にサーバーで描画する(静的化するとビルド時データが焼き込まれる)
export const dynamic = "force-dynamic";

/** 報酬の計算例に使う初期費用(税抜) */
const EXAMPLE_INITIAL_FEE = 100_000;

export default async function AgenciesPage() {
  const repo = await getServiceRepository();
  const [agencies, members, customers, invoices, commissions, links] = await Promise.all([
    repo.listAgencies(),
    repo.listAgencyMembers(),
    repo.listCustomers(),
    repo.listInvoices(),
    repo.listAgencyCommissions(),
    repo.listApplicationLinks(),
  ]);
  const month = currentMonth();

  const rows = agencies.map((agency) => {
    const agencyMembers = members.filter((m) => m.agencyId === agency.id);
    const lines = agencyCommissionLines({ agency, commissions, customers, members: agencyMembers, invoices });
    const summary = summarizeAgencyCommissions(lines);
    const statement = computeAgencyStatement({
      agency,
      members: agencyMembers,
      customers,
      invoices,
      commissions,
      month,
    });
    return {
      agency,
      memberCount: agencyMembers.filter((m) => m.active).length,
      customerCount: customers.filter((c) => c.agencyId === agency.id).length,
      linkCount: links.filter((l) => l.agencyId === agency.id && l.active).length,
      monthTotal: statement.total,
      summary,
    };
  });

  const unpaidTotal = rows.reduce((s, r) => s + r.summary.unpaidTotal, 0);
  const pendingTotal = rows.reduce((s, r) => s + r.summary.pendingTotal, 0);

  return (
    <div>
      <PageHeader
        title="代理店"
        description="代理店の区分（取次型・営業・初期設定型）ごとに、獲得したお客様の初期費用から報酬を計算します。代理店に渡す「紹介〜契約までのURL」もここから発行します。"
        actions={<NewAgencyButton />}
      />

      {/* 制度の説明 */}
      <Card className="mb-4 p-4">
        <div className="flex items-start gap-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">代理店の区分と報酬</h2>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {AGENCY_DEAL_TYPE_KEYS.map((t) => (
                <div key={t} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <DealTypeBadge dealType={t} />
                    <span className="text-sm font-semibold">{agencyRateLabel(t)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{AGENCY_DEAL_TYPES[t].scope}</p>
                  <p className="mt-1 text-xs">
                    例: 初期費用 {formatJPY(EXAMPLE_INITIAL_FEE)}（税抜）のお客様 → 報酬{" "}
                    <span className="font-semibold">
                      {formatJPY(agencyCommissionAmount(EXAMPLE_INITIAL_FEE, t))}
                    </span>
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              報酬は受注確定（初回請求書の作成）のときに金額が決まり、お客様の初期費用の入金を確認した月の支払明細に計上されます。
              伴走型（導入後の運用支援まで担当）は今後追加予定です。
            </p>
          </div>
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="代理店数" value={`${agencies.filter((a) => a.active).length}社`} />
        <SummaryTile
          label="獲得したお客様"
          value={`${customers.filter((c) => c.agencyId).length}件`}
        />
        <SummaryTile label="未払いの報酬" value={formatJPY(unpaidTotal)} accent={unpaidTotal > 0} />
        <SummaryTile label="入金待ちの報酬（未確定）" value={formatJPY(pendingTotal)} />
      </div>

      <Card className="p-4">
        {rows.length === 0 ? (
          <EmptyState
            title="代理店がありません"
            description="「新規代理店」から登録し、代理店の画面で「代理店用の申込・契約URL」を発行して代理店へ渡してください。URLから届いたお申込みは自動で代理店経由として記録されます。"
            icon={<Handshake className="h-5 w-5" />}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>コード</TH>
                <TH>代理店名</TH>
                <TH>区分</TH>
                <TH>担当者</TH>
                <TH className="text-right">営業</TH>
                <TH className="text-right">受付中URL</TH>
                <TH className="text-right">獲得顧客</TH>
                <TH className="text-right">今月確定の報酬</TH>
                <TH className="text-right">未払い</TH>
                <TH>状態</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map(({ agency, memberCount, customerCount, linkCount, monthTotal, summary }) => (
                <TR key={agency.id}>
                  <TD className="tabular text-muted-foreground">{agency.code}</TD>
                  <TD primary>
                    <Link
                      href={`/agencies/${agency.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {agency.name}
                    </Link>
                  </TD>
                  <TD>
                    <DealTypeBadge dealType={agency.defaultDealType} withRate />
                  </TD>
                  <TD className="text-muted-foreground">{agency.contactName || "—"}</TD>
                  <TD className="tabular text-right">{memberCount}名</TD>
                  <TD className="tabular text-right">{linkCount}件</TD>
                  <TD className="tabular text-right">{customerCount}件</TD>
                  <TD className="tabular text-right">{formatJPY(monthTotal)}</TD>
                  <TD className="tabular text-right font-medium">
                    {summary.unpaidTotal > 0 ? (
                      <span className="text-warning">{formatJPY(summary.unpaidTotal)}</span>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD>
                    <Badge tone={agency.active ? "success" : "neutral"} dot>
                      {agency.active ? "取引中" : "停止"}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function SummaryTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`tabular mt-0.5 text-lg font-bold ${accent ? "text-warning" : ""}`}>{value}</div>
    </div>
  );
}
