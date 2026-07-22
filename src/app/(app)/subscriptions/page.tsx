import { Repeat, TrendingUp, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { getRepository } from "@/lib/data";
import { subscriptionMonthly, withTax } from "@/lib/domain/calculations";
import type { Plan } from "@/lib/domain/types";
import { formatJPY } from "@/lib/utils";
import { SubscriptionsClient } from "./subscriptions-client";
import { PlanEditButton } from "./plan-dialog";

export const metadata = { title: "定期請求" };

// 一覧はデータ依存のため常にサーバーで描画する(静的化するとビルド時データが焼き込まれる)
export const dynamic = "force-dynamic";

export default async function SubscriptionsPage() {
  const repo = await getRepository();
  const [subscriptions, plans, customers, metrics] = await Promise.all([
    repo.listSubscriptions(),
    repo.listPlans(),
    repo.listCustomers({ status: "active" }),
    repo.getDashboardMetrics(),
  ]);

  const planById = new Map(plans.map((p) => [p.id, p]));
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const rows = subscriptions
    .map((s) => {
      const plan = planById.get(s.planId);
      const monthlyExcl = plan ? subscriptionMonthly(plan, s.optionKeys, s.priceOverride) : 0;
      return {
        ...s,
        customerName: customerName(s.customerId),
        planName: plan ? `${plan.name}（${plan.term === "annual" ? "年間" : "月額"}）` : "—",
        planAmount: plan?.amount ?? 0,
        planOptions: plan?.options ?? [],
        monthlyTotal: monthlyExcl,
        monthlyInclTotal: plan ? withTax(monthlyExcl, plan.taxRate) : 0,
      };
    })
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "active" ? -1 : 1));

  const planCounts = new Map<string, number>();
  for (const s of subscriptions.filter((s) => s.status === "active")) {
    planCounts.set(s.planId, (planCounts.get(s.planId) ?? 0) + 1);
  }

  const monthlyPlans = plans.filter((p) => p.active && p.term === "monthly");
  const annualPlans = plans.filter((p) => p.active && p.term === "annual");

  return (
    <div>
      <PageHeader
        title="定期請求"
        description="料金プラン（基本料金＋オプション）と定期請求を管理します。毎月の請求は自動生成できます。"
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          label="MRR（月次経常収益）"
          value={formatJPY(metrics.mrr)}
          sub="税込・稼働契約"
          icon={<TrendingUp className="h-5 w-5" />}
          accent="primary"
        />
        <StatCard
          label="稼働中の契約"
          value={`${metrics.activeSubscriptions}件`}
          icon={<Repeat className="h-5 w-5" />}
          accent="success"
        />
        <StatCard
          label="プラン数"
          value={`${plans.filter((p) => p.active).length}種`}
          icon={<Users className="h-5 w-5" />}
        />
      </div>

      <PlanGrid title="月額プラン" plans={monthlyPlans} counts={planCounts} />
      <PlanGrid title="年間プラン" plans={annualPlans} counts={planCounts} />

      <Card className="mt-6 p-4">
        <SubscriptionsClient rows={rows} customers={customers} plans={plans} />
      </Card>
    </div>
  );
}

function PlanGrid({
  title,
  plans,
  counts,
}: {
  title: string;
  plans: Plan[];
  counts: Map<string, number>;
}) {
  if (plans.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => {
          const full = subscriptionMonthly(p, p.options.map((o) => o.key));
          return (
            <Card key={p.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between">
                <div className="font-semibold">{p.name}</div>
                <Badge tone="neutral">{p.term === "annual" ? "年間" : "月額"}</Badge>
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="tabular text-2xl font-bold">{formatJPY(p.amount)}</span>
                <span className="text-xs text-muted-foreground">/ 月（基本・税抜）</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                初期費用 {formatJPY(p.initialFee)}（税抜）
              </div>
              <div className="mt-3 space-y-1 border-t border-border pt-3 text-xs">
                {p.options.map((o) => (
                  <div key={o.key} className="flex justify-between text-muted-foreground">
                    <span>＋{o.name}</span>
                    <span className="tabular">{formatJPY(o.monthly)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-1 font-medium text-foreground">
                  <span>フル導入時（税抜）</span>
                  <span className="tabular">{formatJPY(full)}/月</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>税込</span>
                  <span className="tabular">{formatJPY(withTax(full, p.taxRate))}/月</span>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                  加入 {counts.get(p.id) ?? 0}社
                </span>
                <PlanEditButton plan={p} />
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
