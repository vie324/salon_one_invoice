import { getServiceRepository } from "@/lib/data";
import { computeCustomerLtv } from "@/lib/domain/ltv";
import { computeOnboardingSignals } from "@/lib/domain/onboarding";
import { PageHeader } from "@/components/ui/page-header";
import { PipelineBoard, type PipelineCard } from "./board";

export const metadata = { title: "顧客ステータス" };

// カンバンはデータ依存のため常にサーバーで描画する
export const dynamic = "force-dynamic";

/**
 * 顧客ステータス管理(カンバン)。
 * 申込 → 契約 → 初回請求(初期費用＋初月日割り・振込) → 振替手続き(依頼書の
 * 送付→受領→登録) → 入金チェック → 運用中(毎月の引き落とし) を列で管理する。
 * カードには契約・請求・入金・口座振替の実データがシグナルとして自動表示され、
 * ズレがあれば推奨ステージへワンクリック/一括で同期できる。
 */
export default async function PipelinePage() {
  const repo = await getServiceRepository();
  const [onboardings, customers, contracts, invoices, payments, subscriptions, plans] =
    await Promise.all([
      repo.listOnboardings(),
      repo.listCustomers(),
      repo.listContracts(),
      repo.listInvoices(),
      repo.listPayments(),
      repo.listSubscriptions(),
      repo.listPlans(),
    ]);
  const mandateEntries = await Promise.all(
    customers.map(async (c) => [c.id, await repo.getMandateByCustomer(c.id)] as const),
  );
  const mandateMap = new Map(mandateEntries);

  const cards: PipelineCard[] = [];
  for (const o of onboardings) {
    const customer = customers.find((c) => c.id === o.customerId);
    if (!customer) continue;
    const signals = computeOnboardingSignals({
      customer,
      contracts: contracts.filter((c) => c.customerId === customer.id),
      invoices: invoices.filter((i) => i.customerId === customer.id),
      subscriptions: subscriptions.filter((s) => s.customerId === customer.id),
      plans,
      mandate: mandateMap.get(customer.id) ?? null,
    });
    const ltv = computeCustomerLtv(customer, payments);
    cards.push({
      id: o.id,
      customerId: customer.id,
      name: customer.name,
      code: customer.code,
      assignee: customer.assignee,
      paymentMethod: customer.paymentMethod,
      stage: o.stage,
      dueDate: o.dueDate,
      nextAction: o.nextAction,
      checklist: o.checklist,
      stageChangedAt: o.stageChangedAt,
      history: o.history,
      monthlyFee: signals.monthlyFee,
      ltvTotal: ltv.total,
      outstanding: signals.outstanding,
      overdueCount: signals.overdueCount,
      contractStatus: signals.contractStatus,
      initialInvoiceId: signals.initialInvoiceId,
      initialInvoiceStatus: signals.initialInvoiceStatus,
      mandateStatus: signals.mandateStatus,
      subscriptionActive: signals.subscriptionActive,
      recommendedStage: signals.recommendedStage,
    });
  }

  return (
    <div className="flex min-h-0 flex-col">
      <PageHeader
        title="顧客ステータス"
        description="申込から運用開始までをカンバンで管理します。初期費用＋初月日割りは請求書(銀行振込)、以降は口座振替(引き落とし)の運用です。カードをドラッグしてステージを移動できます。"
      />
      <PipelineBoard initialCards={cards} />
    </div>
  );
}
