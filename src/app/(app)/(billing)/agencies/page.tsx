import { Handshake } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getServiceRepository } from "@/lib/data";
import { computeAgencyStatement } from "@/lib/domain/agency";
import { currentMonth, formatJPY, formatPercent } from "@/lib/utils";
import { NewAgencyButton } from "./new-agency-button";

export const metadata = { title: "代理店" };

// 一覧はデータ依存のため常にサーバーで描画する(静的化するとビルド時データが焼き込まれる)
export const dynamic = "force-dynamic";

export default async function AgenciesPage() {
  const repo = await getServiceRepository();
  const [agencies, members, customers, invoices] = await Promise.all([
    repo.listAgencies(),
    repo.listAgencyMembers(),
    repo.listCustomers(),
    repo.listInvoices(),
  ]);
  const month = currentMonth();

  const rows = agencies.map((agency) => {
    const statement = computeAgencyStatement({
      agency,
      members: members.filter((m) => m.agencyId === agency.id),
      customers,
      invoices,
      month,
    });
    return {
      agency,
      memberCount: members.filter((m) => m.agencyId === agency.id && m.active).length,
      customerCount: customers.filter((c) => c.agencyId === agency.id).length,
      paidSubtotal: statement.paidSubtotal,
      commission: statement.commission,
    };
  });

  const totalCommission = rows.reduce((s, r) => s + r.commission, 0);

  return (
    <div>
      <PageHeader
        title="代理店"
        description="営業代理店・営業マンの実績と、毎月の支払額(手数料)を管理します。"
        actions={<NewAgencyButton />}
      />

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <SummaryTile label="代理店数" value={`${agencies.length}社`} />
        <SummaryTile label="紹介顧客数" value={`${customers.filter((c) => c.agencyId).length}件`} />
        <SummaryTile label="今月の支払予定合計" value={formatJPY(totalCommission)} accent={totalCommission > 0} />
      </div>

      <Card className="p-4">
        {rows.length === 0 ? (
          <EmptyState
            title="代理店がありません"
            description="「新規代理店」から登録し、顧客の編集画面で獲得代理店・営業マンを紐付けると売上と支払額が自動集計されます。"
            icon={<Handshake className="h-5 w-5" />}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>コード</TH>
                <TH>代理店名</TH>
                <TH>担当者</TH>
                <TH className="text-right">手数料率</TH>
                <TH className="text-right">営業人数</TH>
                <TH className="text-right">紹介顧客</TH>
                <TH className="text-right">今月の入金済売上(税抜)</TH>
                <TH className="text-right">今月の支払予定</TH>
                <TH>状態</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map(({ agency, memberCount, customerCount, paidSubtotal, commission }) => (
                <TR key={agency.id}>
                  <TD className="tabular text-muted-foreground">{agency.code}</TD>
                  <TD>
                    <Link
                      href={`/agencies/${agency.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {agency.name}
                    </Link>
                  </TD>
                  <TD className="text-muted-foreground">{agency.contactName || "—"}</TD>
                  <TD className="tabular text-right">{formatPercent(agency.commissionRate, 0)}</TD>
                  <TD className="tabular text-right">{memberCount}名</TD>
                  <TD className="tabular text-right">{customerCount}件</TD>
                  <TD className="tabular text-right">{formatJPY(paidSubtotal)}</TD>
                  <TD className="tabular text-right font-medium">{formatJPY(commission)}</TD>
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
      <div className={`tabular mt-0.5 text-lg font-bold ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
