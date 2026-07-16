import { FileSignature, ShieldCheck } from "lucide-react";
import { getJobRepository } from "@/lib/data";
import {
  effectiveContractStatus,
  sanitizeContractForSigner,
} from "@/lib/contracts/build";
import { ContractCertificate } from "@/components/contracts/contract-certificate";
import { ContractDocument } from "@/components/contracts/contract-document";
import { SignPagePrintButton } from "./print-button";
import { SignClient } from "./sign-client";

export const metadata = { title: "電子契約のご確認・ご署名" };
export const dynamic = "force-dynamic";

/**
 * 公開署名ページ(契約者向け・認証不要)。
 * アクセス制御は暗号乱数トークン + 任意のアクセスコード + 試行回数制限で行う。
 * デモ/本番ともサービスロールのリポジトリを使用する(RLSは社内スタッフ用のため)。
 */
export default async function SignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const repo = await getJobRepository();
  const contract = await repo.getContractByToken(token);

  if (!contract) {
    return (
      <Shell>
        <Notice
          title="リンクが無効です"
          body="この署名リンクは存在しないか、取消・再発行により無効化されています。お手数ですが送信元にお問い合わせください。"
        />
      </Shell>
    );
  }

  const org = await repo.getOrganization();
  const status = effectiveContractStatus(contract);

  if (status === "signed") {
    const events = await repo.listContractEvents(contract.id);
    return (
      <Shell orgName={org.name}>
        <div className="no-print mx-auto mb-6 max-w-3xl rounded-lg border border-success/40 bg-success/10 p-4">
          <div className="flex items-center gap-2 font-semibold text-success">
            <ShieldCheck className="h-5 w-5" />
            この契約は締結済みです
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            締結済みの契約書と締結証明書を表示しています。「印刷 / PDF保存」からお手元に保管してください。
          </p>
          <div className="mt-3">
            <SignPagePrintButton />
          </div>
        </div>
        <div className="space-y-8">
          <ContractDocument contract={contract} />
          <ContractCertificate contract={contract} events={events} org={org} />
        </div>
      </Shell>
    );
  }

  if (status === "declined") {
    return (
      <Shell orgName={org.name}>
        <Notice
          title="この契約は辞退されています"
          body="この契約書は締結を辞退済みです。内容についてのご相談は送信元にお問い合わせください。"
        />
      </Shell>
    );
  }

  if (status === "canceled") {
    return (
      <Shell orgName={org.name}>
        <Notice
          title="この契約書は取り消されています"
          body="この契約書は送信元により取り消されました。お手数ですが送信元にお問い合わせください。"
        />
      </Shell>
    );
  }

  if (status === "expired") {
    return (
      <Shell orgName={org.name}>
        <Notice
          title="署名期限が切れています"
          body="この署名リンクの有効期限が過ぎています。送信元に再送をご依頼ください。"
        />
      </Shell>
    );
  }

  // sent / viewed → 署名フロー
  const requiresCode = !!contract.accessCode;
  return (
    <Shell orgName={org.name}>
      <SignClient
        token={token}
        requiresCode={requiresCode}
        orgName={org.name}
        contractNumber={contract.contractNumber}
        contractTitle={contract.title}
        expiresAt={contract.expiresAt}
        // アクセスコード不要の場合のみ内容を初期表示(コード必須時は検証後に取得)。
        // 社内CRM情報を含む customer とアクセスコードは渡さない。
        initialContract={requiresCode ? null : sanitizeContractForSigner(contract)}
        defaultSignerName={contract.customerParty.representative}
      />
    </Shell>
  );
}

function Shell({ children, orgName }: { children: React.ReactNode; orgName?: string }) {
  return (
    <div className="min-h-screen bg-neutral-100 py-8 dark:bg-background">
      <div className="mx-auto max-w-3xl px-4">
        <div className="no-print mb-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <FileSignature className="h-4 w-4" />
          電子契約{orgName ? ` — ${orgName}` : ""}
        </div>
        {children}
      </div>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center shadow-sm">
      <h1 className="text-lg font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
