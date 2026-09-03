import { getJobRepository } from "@/lib/data";
import { ReferForm } from "../refer-form";
import { ReferNotice, ReferShell } from "../shell";

export const metadata = { title: "ご紹介フォーム" };
export const dynamic = "force-dynamic";

/**
 * 紹介者を指定した紹介フォーム(お客様向け・認証不要)。
 * 紹介者ごとにURLを配ると、「誰に紹介されたか」の入力なしで紹介元をたどれる。
 * 受付停止・有効期限は申込URLと同じ扱い。
 */
export default async function ReferWithTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const repo = await getJobRepository();
  const { link, state } = await repo.getReferralLinkByToken(token);

  if (!link || state === "not_found") {
    return (
      <ReferShell>
        <ReferNotice
          title="URLが無効です"
          body="このご紹介URLは存在しないか、削除されています。お手数ですが送信元にお問い合わせください。"
        />
      </ReferShell>
    );
  }

  const org = await repo.getOrganization();

  if (state === "inactive") {
    return (
      <ReferShell orgName={org.name}>
        <ReferNotice
          title="現在お申込みを受け付けていません"
          body="このご紹介URLは受付を停止しています。お手数ですが送信元にお問い合わせください。"
        />
      </ReferShell>
    );
  }

  if (state === "expired") {
    return (
      <ReferShell orgName={org.name}>
        <ReferNotice
          title="お申込みの期限が過ぎています"
          body="このご紹介URLの有効期限が切れています。送信元に再発行をご依頼ください。"
        />
      </ReferShell>
    );
  }

  return (
    <ReferShell orgName={org.name}>
      <ReferForm
        token={token}
        orgName={org.name}
        // 紹介者が決まっているURLでは、紹介者名を固定で表示する
        fixedReferrerName={link.referrerName || undefined}
      />
    </ReferShell>
  );
}
