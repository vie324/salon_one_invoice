import { Repeat, TrendingUp, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { getRepository } from "@/lib/data";
import { formatJPY } from "@/lib/utils";
import { SubscriptionsClient } from "./subscriptions-client";

export const metadata = { title: "定期請求" };

export default async function SubscriptionsPage() {
  const repo = await getRepository();
  const [subscriptions, plans, customers, metrics] = await Promise.all([
    repo.listSubscriptions(),
    repo.listPlans(),
    repo.listCustomers({ status: "active" }),
    repo.getDashboardMetrics(),
  ]);

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const rows = subscriptions
    .map((s) => {
      const plan = plans.find((p) => p.id === s.planId);
      return {
        ...s,
        customerName: customerName(s.customerId),
        planName: plan?.name ?? "—",
        planAmount: plan?.amount ?? 0,
      };
    })
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "active" ? -1 : 1));

  const planCounts = new Map<string, number>();
  for (const s of subscriptions.filter((s) => s.status === "active")) {
    planCounts.set(s.planId, (planCounts.get(s.planId) ?? 0) + 1);
  }

  return (
    <div>
      <PageHeader
        title="定期請求"
        description="サブスクリプション(月額)プランと定期請求を管理します。毎月の請求は自動生成できます。"
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

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => (
          <Card key={p.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{p.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="tabular text-2xl font-bold">{formatJPY(p.amount)}</div>
              <div className="text-xs text-muted-foreground">/ 月（税抜）</div>
              <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
              <div className="mt-3 text-xs">
                <span className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">
                  加入 {planCounts.get(p.id) ?? 0}名
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <SubscriptionsClient rows={rows} customers={customers} plans={plans} />
      </Card>
    </div>
  );
}
