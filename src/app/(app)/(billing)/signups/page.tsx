import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { getServiceRepository } from "@/lib/data";
import { loadOrderBook } from "@/lib/orders/load";
import { buildSignupBook } from "@/lib/orders/signups";
import { isMonthKey } from "@/lib/utils";
import { SignupsClient, type SignupPeriod, type SignupProductFilter } from "./signups-client";

export const metadata = { title: "申込一覧" };

// 一覧はデータ依存のため常にサーバーで描画する
export const dynamic = "force-dynamic";

/**
 * 申込一覧 — どのお客様が・いつ・いくらで申し込んだかを1か所で見る。
 * SalonOne(システム)とマーケティング代行を、申込日の新しい順・申込月ごとに並べる。
 * 進め方(受注確認・導入準備)は受注管理、金額の変更は定期請求で行う。
 */
export default async function SignupsPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; period?: string }>;
}) {
  const sp = await searchParams;
  const product: SignupProductFilter =
    sp.product === "system" || sp.product === "marketing" ? sp.product : "all";
  const period: SignupPeriod =
    sp.period && (isMonthKey(sp.period) || /^\d{4}$/.test(sp.period)) ? sp.period : "all";

  const repo = await getServiceRepository();
  const [book, marketing] = await Promise.all([
    loadOrderBook(repo, { sync: false }),
    repo.listMarketingServices(),
  ]);
  const { rows, awaitingSignature } = buildSignupBook(book, marketing);

  return (
    <div>
      <PageHeader
        title="申込一覧"
        description="どのお客様が・いつ・いくらで申し込んだかを、申込日の新しい順に並べています。行を押すと料金の内訳が開きます。"
        actions={
          <Link href="/orders" className={buttonClasses({ variant: "outline" })}>
            受注管理へ <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />
      <SignupsClient
        rows={rows}
        awaitingSignature={awaitingSignature}
        initialProduct={product}
        initialPeriod={period}
      />
    </div>
  );
}
