import { ClipboardList } from "lucide-react";
import { DEFAULT_TEMPLATE_SLUG } from "@/lib/contracts/default-template";
import { getJobRepository } from "@/lib/data";
import { getEmailStatus } from "@/lib/email";
import { pickOrderTemplate } from "@/lib/orders/contract-draft";
import { ApplyForm } from "./apply-form";
import { OrderForm, type OrderFormIntro } from "./order-form";

export const metadata = { title: "お申込み・ご契約" };
export const dynamic = "force-dynamic";

/**
 * 公開の申込・契約フォーム(お客様向け・認証不要)。
 * アクセス制御は暗号乱数トークン + 受付停止 + 有効期限で行う。
 * 認証ゲートを通らない経路のため getJobRepository を使用する。
 *
 * - 申込＋契約URL: お客様情報 → プラン・料金 → 連携情報 → 契約内容の確認・電子署名 を1本で完結
 * - 代理店URL:     上記に加えて「まずは相談したい」(問い合わせ)の入口を出す
 * - 申込のみURL:   従来どおり申込内容だけを受け付ける(契約書は担当者が後から送る)
 */
export default async function ApplyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const repo = await getJobRepository();
  const { link, state } = await repo.getApplicationLinkByToken(token);

  if (!link || state === "not_found") {
    return (
      <Shell>
        <Notice
          title="URLが無効です"
          body="このお申込みURLは存在しないか、削除されています。お手数ですが送信元にお問い合わせください。"
        />
      </Shell>
    );
  }

  const org = await repo.getOrganization();

  if (state === "inactive") {
    return (
      <Shell orgName={org.name}>
        <Notice
          title="現在お申込みを受け付けていません"
          body="このお申込みURLは受付を停止しています。お手数ですが送信元にお問い合わせください。"
        />
      </Shell>
    );
  }

  if (state === "expired") {
    return (
      <Shell orgName={org.name}>
        <Notice
          title="お申込みの期限が過ぎています"
          body="このお申込みURLの有効期限が切れています。送信元に再発行をご依頼ください。"
        />
      </Shell>
    );
  }

  // 申込のみ(旧来)のURL
  if (!link.withContract || !link.planId) {
    return (
      <Shell orgName={org.name} title="お申込みフォーム">
        <ApplyForm token={token} orgName={org.name} />
      </Shell>
    );
  }

  const [plan, templates, agency, members, referral] = await Promise.all([
    repo.getPlan(link.planId),
    repo.listContractTemplates(),
    link.agencyId ? repo.getAgency(link.agencyId) : Promise.resolve(null),
    link.agencyId ? repo.listAgencyMembers(link.agencyId) : Promise.resolve([]),
    link.referralId ? repo.getReferral(link.referralId) : Promise.resolve(null),
  ]);
  const template = pickOrderTemplate(templates, DEFAULT_TEMPLATE_SLUG);
  if (!plan || !template) {
    return (
      <Shell orgName={org.name}>
        <Notice
          title="お申込みの準備ができていません"
          body="お手数ですが送信元にお問い合わせください（プランまたは契約書が見つかりません）。"
        />
      </Shell>
    );
  }

  const member = members.find((m) => m.id === link.agencyMemberId);
  const intro: OrderFormIntro = {
    agencyName: agency?.name ?? referralAgencyName(referral?.agencyId ? referral.referrerName : null),
    memberName: member?.name ?? null,
    // 既存のお客様からのご紹介なら特典(初月日割り＋2ヶ月無料)を案内する
    referralBenefit: Boolean(referral && !referral.agencyId && referral.referrerCustomerId),
    referrerName: referral && !referral.agencyId ? referral.referrerName : null,
  };

  return (
    <Shell orgName={org.name} title="お申込み・ご契約">
      <OrderForm
        token={token}
        orgName={org.name}
        plan={plan}
        link={{
          optionKeys: link.optionKeys,
          storeCount: link.storeCount,
          initialFeeOverride: link.initialFeeOverride,
          monthlyPriceOverride: link.monthlyPriceOverride,
        }}
        template={{
          id: template.id,
          version: template.version,
          docTitle: template.docTitle,
          preamble: template.preamble,
          sections: template.sections,
          providerDefault: template.providerDefault,
        }}
        org={{
          name: org.name,
          postalCode: org.postalCode,
          address: org.address,
          email: org.email,
        }}
        intro={intro}
        allowInquiry={link.allowInquiry}
        emailEnabled={getEmailStatus().mode === "send"}
        prefill={
          referral
            ? {
                companyName: referral.companyName,
                contactName: referral.contactName,
                phone: referral.phone,
                email: referral.email,
              }
            : null
        }
      />
    </Shell>
  );
}

function referralAgencyName(name: string | null): string | null {
  return name ? name.replace(/（.*）$/, "") : null;
}

function Shell({
  children,
  orgName,
  title = "お申込み",
}: {
  children: React.ReactNode;
  orgName?: string;
  title?: string;
}) {
  return (
    <div className="min-h-screen bg-neutral-100 py-5 dark:bg-background sm:py-8">
      <div className="mx-auto max-w-3xl px-4">
        <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <ClipboardList className="h-4 w-4" />
          {title}
          {orgName ? ` — ${orgName}` : ""}
        </div>
        {children}
      </div>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 text-center shadow-sm sm:p-8">
      <h1 className="text-lg font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
