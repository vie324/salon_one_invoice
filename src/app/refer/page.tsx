import { getJobRepository } from "@/lib/data";
import { ReferForm } from "./refer-form";
import { ReferShell } from "./shell";

export const metadata = { title: "ご紹介フォーム" };
export const dynamic = "force-dynamic";

/**
 * 常設の紹介フォーム(お客様向け・認証不要)。
 * 申込フォームと違いトークンを必要としないため、このURLをそのまま配れる。
 * 「誰に紹介されたか」はフォームで入力してもらい、管理画面で顧客に突き合わせる。
 *
 * 認証ゲートを通らない経路のため getJobRepository を使用する。
 */
export default async function ReferPage() {
  const repo = await getJobRepository();
  const org = await repo.getOrganization();
  return (
    <ReferShell orgName={org.name}>
      <ReferForm token={null} orgName={org.name} />
    </ReferShell>
  );
}
