import { redirect } from "next/navigation";

/**
 * 旧「顧客別料金」。お客様ごとの金額は申込日つきで「申込一覧」に1本化したため、
 * ブックマークなどで開かれたら申込一覧へ移動する。
 */
export default function PricingPage() {
  redirect("/signups");
}
