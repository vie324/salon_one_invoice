import { Gift } from "lucide-react";
import { headers } from "next/headers";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { appUrl } from "@/lib/config";
import { getServiceRepository } from "@/lib/data";
import {
  REFERRAL_FREE_MONTHS,
  REFERRAL_REWARD_RATE,
} from "@/lib/domain/constants";
import {
  contactDue,
  isOpenReferral,
  referralFormUrl,
  sortByContactWish,
} from "@/lib/domain/referral";
import { formatJPY } from "@/lib/utils";
import { ReferralLinkManager } from "./link-manager";
import { ReferralList } from "./referral-list";

export const metadata = { title: "紹介制度" };

// 一覧はデータ依存のため常にサーバーで描画する
export const dynamic = "force-dynamic";

/** 絶対URLの基点(NEXT_PUBLIC_APP_URL 優先、無ければリクエストヘッダから) */
async function baseUrl(): Promise<string> {
  if (appUrl) return appUrl.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  if (!host) return "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function ReferralsPage() {
  const repo = await getServiceRepository();
  const [links, referrals, customers, base] = await Promise.all([
    repo.listReferralLinks(),
    repo.listReferrals(),
    repo.listCustomers(),
    baseUrl(),
  ]);

  const now = new Date();
  const sorted = sortByContactWish(referrals);
  const open = referrals.filter(isOpenReferral);
  const overdue = open.filter((r) => contactDue(r, now).overdue);
  const payable = referrals.filter((r) => r.rewardStatus === "payable");
  const payableTotal = payable.reduce((s, r) => s + r.rewardAmount, 0);

  return (
    <div>
      <PageHeader
        title="紹介制度"
        description={`ご紹介いただいた方には初期費用の${Math.round(REFERRAL_REWARD_RATE * 100)}%をお支払い、ご紹介を受けた方は初月の端数日数＋${REFERRAL_FREE_MONTHS}ヶ月無料。フォームからのお申込みをここで受け付けます。`}
      />

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryTile label="ご紹介 合計" value={`${referrals.length}件`} />
        <SummaryTile label="未対応・連絡待ち" value={`${open.length}件`} accent={open.length > 0} />
        <SummaryTile label="連絡希望日 超過" value={`${overdue.length}件`} accent={overdue.length > 0} />
        <SummaryTile
          label="お支払い待ちの謝礼"
          value={payableTotal > 0 ? formatJPY(payableTotal) : `${payable.length}件`}
          accent={payable.length > 0}
        />
      </div>

      <div className="mb-6">
        <ReferralLinkManager
          links={links}
          baseUrl={base}
          formUrl={referralFormUrl(base)}
          customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        />
      </div>

      <Card className="p-3 sm:p-4">
        <h2 className="mb-3 text-sm font-semibold">ご紹介の一覧</h2>
        {referrals.length === 0 ? (
          <EmptyState
            title="ご紹介はまだありません"
            description="上の紹介フォームURLをお客様にお渡しすると、送信された内容がここに表示されます。"
            icon={<Gift className="h-5 w-5" />}
          />
        ) : (
          <ReferralList
            rows={sorted.map((r) => ({
              ...r,
              due: contactDue(r, now),
            }))}
            customers={customers.map((c) => ({ id: c.id, name: c.name }))}
          />
        )}
      </Card>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <Card className="px-3 py-2.5 sm:px-4 sm:py-3">
      <div className="text-[11px] leading-tight text-muted-foreground sm:text-xs">{label}</div>
      <div
        className={`tabular mt-0.5 text-lg font-bold ${accent ? "text-warning" : "text-foreground"}`}
      >
        {value}
      </div>
    </Card>
  );
}
