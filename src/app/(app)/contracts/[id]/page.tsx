import {
  CircleDot,
  Eye,
  FileSignature,
  KeyRound,
  Link2,
  Mail,
  PenLine,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContractDocument } from "@/components/contracts/contract-document";
import { ContractStatusBadge } from "@/components/status-badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRepository } from "@/lib/data";
import { contractEventLabels } from "@/lib/domain/constants";
import type { ContractEventType } from "@/lib/domain/types";
import { formatDateTime, formatJPY } from "@/lib/utils";
import { ContractActions } from "./contract-actions";

export const metadata = { title: "契約書の詳細" };

const eventIcons: Partial<Record<ContractEventType, React.ComponentType<{ className?: string }>>> = {
  created: FileSignature,
  updated: PenLine,
  sent: Mail,
  reminded: Mail,
  viewed: Eye,
  code_failed: KeyRound,
  code_verified: KeyRound,
  signed: ShieldCheck,
  manual_signed: ShieldCheck,
  declined: XCircle,
  canceled: XCircle,
  billing_linked: Link2,
};

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repo = await getRepository();
  const contract = await repo.getContract(id);
  if (!contract) notFound();
  const events = await repo.listContractEvents(id);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="tabular text-xl font-bold tracking-tight sm:text-2xl">
              {contract.contractNumber}
            </h1>
            <ContractStatusBadge status={contract.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {contract.title} ・{" "}
            <Link href={`/customers/${contract.customerId}`} className="text-primary hover:underline">
              {contract.customer?.name}
            </Link>
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* 書面プレビュー */}
        <div className="min-w-0">
          <ContractDocument contract={contract} />
        </div>

        {/* サイド: 操作 + 概要 + 証跡 */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>操作</CardTitle>
            </CardHeader>
            <CardContent>
              <ContractActions
                id={contract.id}
                status={contract.status}
                defaultEmail={contract.signerEmail || contract.customerParty.email}
                signToken={contract.signToken}
                accessCode={contract.accessCode}
                hasPlan={!!contract.terms.planId}
                hasInitialFee={(contract.terms.initialFee ?? 0) > 0}
                billingLinked={!!contract.linkedSubscriptionId || !!contract.linkedInvoiceId}
                defaultSignerName={contract.customerParty.representative}
                defaultStartDate={contract.terms.startDate}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>概要</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="プラン" value={contract.terms.planName || "カスタム"} />
              <Row
                label="初期費用(税抜)"
                value={contract.terms.initialFee != null ? formatJPY(contract.terms.initialFee) : "—"}
              />
              <Row
                label="月額(税抜)"
                value={contract.terms.monthlyFee != null ? formatJPY(contract.terms.monthlyFee) : "—"}
              />
              <Row label="店舗数" value={`${contract.terms.storeCount}店舗`} />
              <Row label="送付先" value={contract.signerEmail || contract.customerParty.email || "—"} />
              <Row label="送付日時" value={formatDateTime(contract.sentAt)} />
              <Row label="署名期限" value={formatDateTime(contract.expiresAt)} />
              <Row label="締結日時" value={formatDateTime(contract.signedAt)} />
              {contract.signerName && <Row label="署名者" value={contract.signerName} />}
              {contract.linkedSubscriptionId && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">定期契約</span>
                  <Link href="/subscriptions" className="text-primary hover:underline">
                    連携済み
                  </Link>
                </div>
              )}
              {contract.linkedInvoiceId && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">初期費用請求</span>
                  <Link
                    href={`/invoices/${contract.linkedInvoiceId}`}
                    className="text-primary hover:underline"
                  >
                    請求書を表示
                  </Link>
                </div>
              )}
              {contract.contentHash && (
                <div className="pt-2">
                  <div className="text-xs text-muted-foreground">内容ハッシュ(SHA-256)</div>
                  <div className="tabular mt-0.5 break-all text-[11px] text-muted-foreground">
                    {contract.contentHash}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>締結証跡（監査ログ）</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {events.map((e) => {
                  const Icon = eventIcons[e.type] ?? CircleDot;
                  return (
                    <li key={e.id} className="flex gap-3 text-sm">
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium">{contractEventLabels[e.type]}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDateTime(e.createdAt)}
                          {e.actor && ` ・ ${e.actor}`}
                          {e.ip && ` ・ ${e.ip}`}
                        </div>
                        {e.detail && (
                          <div className="mt-0.5 break-words text-xs text-muted-foreground">
                            {e.detail}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
                証跡は追記専用で保全され、変更・削除はできません。締結済みの契約は
                <Link href={`/print/contracts/${contract.id}`} className="text-primary hover:underline" target="_blank">
                  {" "}印刷ページ{" "}
                </Link>
                から締結証明書付きでPDF保存できます。
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="tabular text-right">{value}</span>
    </div>
  );
}
