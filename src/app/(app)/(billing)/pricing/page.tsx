import { BadgePercent, Repeat, Scale, Tags, TrendingUp } from "lucide-react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { getServiceRepository } from "@/lib/data";
import { buildClientPriceRows, hasCustomPrice, initialFeesByCustomer } from "@/lib/domain/client-pricing";
import { formatJPY } from "@/lib/utils";
import { PricingClient } from "./pricing-client";

export const metadata = { title: "顧客別料金" };

// 一覧はデータ依存のため常にサーバーで描画する(静的化するとビルド時データが焼き込まれる)
export const dynamic = "force-dynamic";

/**
 * 顧客別料金。お客様ごとに毎月いくら請求しているか(プラン・個別価格・オプション・店舗数)を
 * 1つの表で見られるようにする。定価と違う金額のお客様は色付きで目立たせる。
 */
export default async function PricingPage() {
  const repo = await getServiceRepository();
  const [subscriptions, plans, customers, invoices, contracts] = await Promise.all([
    repo.listSubscriptions(),
    repo.listPlans(),
    repo.listCustomers(),
    repo.listInvoices({ type: "initial" }),
    repo.listContracts({ status: "signed" }),
  ]);

  const rows = buildClientPriceRows({
    subscriptions,
    plans,
    customers,
    initialFees: initialFeesByCustomer(invoices, contracts),
  });

  const active = rows.filter((r) => r.status === "active");
  const activeCustomers = new Set(active.map((r) => r.customerId)).size;
  const customCustomers = new Set(active.filter(hasCustomPrice).map((r) => r.customerId)).size;
  const monthlyWithTax = active.reduce((s, r) => s + r.monthlyWithTax, 0);
  const monthlyDiff = active.reduce((s, r) => s + r.monthlyDiff, 0);

  return (
    <div>
      <PageHeader
        title="顧客別料金"
        description="どのお客様に毎月いくら請求しているかを一覧で確認できます。プランの定価と違う金額（個別価格）のお客様は色付きで表示します。金額の変更は「定期請求」で行います。"
        actions={
          <Link href="/subscriptions" className={buttonClasses({ variant: "outline" })}>
            <Repeat className="h-4 w-4" />
            定期請求で変更する
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="契約中のお客様"
          value={`${activeCustomers}社`}
          sub="稼働中の定期契約"
          icon={<Tags className="h-5 w-5" />}
          accent="primary"
        />
        <StatCard
          label="個別価格のお客様"
          value={`${customCustomers}社`}
          sub="定価と違う金額で契約"
          icon={<BadgePercent className="h-5 w-5" />}
          accent="warning"
        />
        <StatCard
          label="毎月の請求合計（税込）"
          value={formatJPY(monthlyWithTax)}
          sub="稼働中の定期契約"
          icon={<TrendingUp className="h-5 w-5" />}
          accent="success"
        />
        <StatCard
          label="定価との差（月額・税抜）"
          value={monthlyDiff === 0 ? "差なし" : formatJPY(monthlyDiff, { sign: true })}
          sub={monthlyDiff < 0 ? "個別価格による値引きの合計" : "個別価格による差の合計"}
          icon={<Scale className="h-5 w-5" />}
        />
      </div>

      <Card className="p-4">
        {rows.length === 0 ? (
          <EmptyState
            title="定期契約がまだありません"
            description="受注管理で受注を確定する（または「請求を開始」する）と、お客様ごとの料金がここに並びます。"
            icon={<Tags className="h-5 w-5" />}
          />
        ) : (
          <PricingClient rows={rows} />
        )}
      </Card>
    </div>
  );
}
