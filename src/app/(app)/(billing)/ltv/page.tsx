import { CircleDollarSign, TrendingUp, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getServiceRepository } from "@/lib/data";
import { subscriptionMonthly, withTax } from "@/lib/domain/calculations";
import { computeCustomerLtv, type CustomerLtv } from "@/lib/domain/ltv";
import { formatJPY } from "@/lib/utils";

export const metadata = { title: "LTV分析" };

// 集計はデータ依存のため常にサーバーで描画する
export const dynamic = "force-dynamic";

/**
 * 顧客LTV(累計入金)の分析。
 * 顧客ごとの「毎月の支払い」と「累計LTV」をランキング形式で俯瞰し、
 * 詳細は顧客詳細ページのLTVチャートで確認する。
 */
export default async function LtvPage() {
  const repo = await getServiceRepository();
  const [customers, payments, subscriptions, plans] = await Promise.all([
    repo.listCustomers(),
    repo.listPayments(),
    repo.listSubscriptions(),
    repo.listPlans(),
  ]);

  const rows = customers
    .map((customer) => {
      const ltv = computeCustomerLtv(customer, payments);
      const monthlyFee = subscriptions
        .filter((s) => s.customerId === customer.id && s.status === "active")
        .reduce((sum, sub) => {
          const plan = plans.find((p) => p.id === sub.planId);
          if (!plan) return sum;
          return (
            sum +
            withTax(
              subscriptionMonthly(plan, sub.optionKeys ?? [], sub.priceOverride),
              plan.taxRate,
            )
          );
        }, 0);
      return { customer, ltv, monthlyFee };
    })
    .sort((a, b) => b.ltv.total - a.ltv.total);

  const totalLtv = rows.reduce((s, r) => s + r.ltv.total, 0);
  const paying = rows.filter((r) => r.ltv.total > 0);
  const avgLtv = paying.length > 0 ? Math.round(totalLtv / paying.length) : 0;
  const mrr = rows.reduce((s, r) => s + r.monthlyFee, 0);
  const last12Total = rows.reduce((s, r) => s + r.ltv.last12, 0);
  const maxLtv = Math.max(1, ...rows.map((r) => r.ltv.total));

  return (
    <div>
      <PageHeader
        title="LTV分析"
        description="顧客ごとの「毎月の支払い」と「累計LTV(生涯価値)」を俯瞰できます。行をクリックすると顧客詳細で月別の推移グラフを確認できます。"
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="累計LTV（全顧客合計）"
          value={formatJPY(totalLtv)}
          sub="確認済み入金の合計"
          icon={<CircleDollarSign className="h-5 w-5" />}
          accent="primary"
        />
        <StatCard
          label="平均LTV / 顧客"
          value={formatJPY(avgLtv)}
          sub={`入金実績のある ${paying.length}社で平均`}
          icon={<Users className="h-5 w-5" />}
          accent="success"
        />
        <StatCard
          label="現在の月額合計（MRR・税込）"
          value={formatJPY(mrr)}
          sub="稼働中の定期契約"
          icon={<TrendingUp className="h-5 w-5" />}
          accent="primary"
        />
        <StatCard
          label="直近12ヶ月の入金"
          value={formatJPY(last12Total)}
          sub="全顧客合計"
          icon={<Wallet className="h-5 w-5" />}
          accent="warning"
        />
      </div>

      <Card>
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="顧客がまだ登録されていません"
              description="顧客を登録し入金を記録すると、LTVが自動で集計されます。"
            />
          </div>
        ) : (
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH className="w-10">#</TH>
                <TH>顧客</TH>
                <TH className="text-right">月額（現在）</TH>
                <TH className="text-right">平均月額</TH>
                <TH className="text-right">直近12ヶ月</TH>
                <TH>月別推移（12ヶ月）</TH>
                <TH className="min-w-[220px] text-right">累計LTV</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map(({ customer, ltv, monthlyFee }, index) => (
                <TR key={customer.id}>
                  <TD className="tabular text-muted-foreground">{index + 1}</TD>
                  <TD>
                    <Link
                      href={`/customers/${customer.id}`}
                      className="font-medium hover:text-primary hover:underline"
                    >
                      {customer.name}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="tabular">{customer.code}</span>
                      <Badge tone={customer.status === "active" ? "success" : "neutral"}>
                        {customer.status === "active" ? "稼働中" : "休止"}
                      </Badge>
                      {ltv.monthsActive > 0 && <span>継続 {ltv.monthsActive}ヶ月</span>}
                    </div>
                  </TD>
                  <TD className="tabular text-right">
                    {monthlyFee > 0 ? (
                      formatJPY(monthlyFee)
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TD>
                  <TD className="tabular text-right text-muted-foreground">
                    {ltv.averageMonthly > 0 ? formatJPY(ltv.averageMonthly) : "—"}
                  </TD>
                  <TD className="tabular text-right text-muted-foreground">
                    {ltv.last12 > 0 ? formatJPY(ltv.last12) : "—"}
                  </TD>
                  <TD>
                    <Sparkline ltv={ltv} />
                  </TD>
                  <TD>
                    <LtvBar total={ltv.total} max={maxLtv} />
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

/** 累計LTVの横棒(最大値比)。数値と長さでランキングを直感的に読めるようにする。 */
function LtvBar({ total, max }: { total: number; max: number }) {
  const ratio = Math.max(0, Math.min(1, total / max));
  return (
    <div className="flex items-center justify-end gap-2.5">
      <div className="h-2.5 w-28 overflow-hidden rounded-full bg-muted sm:w-36">
        <div
          className="h-full rounded-full bg-chart-1"
          style={{ width: `${Math.max(ratio * 100, total > 0 ? 2 : 0)}%` }}
        />
      </div>
      <span className="tabular w-24 text-right font-semibold">
        {total > 0 ? formatJPY(total) : <span className="font-normal text-muted-foreground">—</span>}
      </span>
    </div>
  );
}

/** 直近12ヶ月の入金スパークライン(棒)。支払いリズムをひと目で掴む。 */
function Sparkline({ ltv }: { ltv: CustomerLtv }) {
  const points = ltv.series.slice(-12);
  if (points.length === 0 || points.every((p) => p.amount === 0)) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const w = 120;
  const h = 26;
  const bandW = w / 12;
  const max = Math.max(1, ...points.map((p) => p.amount));
  // 12ヶ月に満たない場合は右詰めにする(直近月が右端)
  const offset = 12 - points.length;
  return (
    <svg width={w} height={h} role="img" aria-label="直近12ヶ月の入金推移">
      {points.map((p, i) => {
        const barH = Math.max(p.amount > 0 ? 2 : 0, (p.amount / max) * (h - 2));
        return (
          <rect
            key={p.month}
            x={(offset + i) * bandW + 1.5}
            y={h - barH}
            width={bandW - 3}
            height={barH}
            rx={1.5}
            className={p.amount > 0 ? "fill-chart-1" : "fill-muted"}
          >
            <title>{`${p.month}: ${formatJPY(p.amount)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
