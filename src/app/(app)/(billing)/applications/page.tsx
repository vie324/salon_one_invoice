import { Inbox } from "lucide-react";
import Link from "next/link";
import { ApplicationStatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { appUrl } from "@/lib/config";
import { getServiceRepository } from "@/lib/data";
import { requestedServices } from "@/lib/domain/application";
import { formatDateTime } from "@/lib/utils";
import { ApplicationLinkManager } from "./link-manager";

export const metadata = { title: "申込" };

// 一覧はデータ依存のため常にサーバーで描画する
export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  const repo = await getServiceRepository();
  const [links, applications] = await Promise.all([
    repo.listApplicationLinks(),
    repo.listApplications(),
  ]);

  const submitted = applications.filter((a) => a.status === "submitted").length;
  const registered = applications.filter((a) => a.status === "customer_created").length;

  return (
    <div>
      <PageHeader
        title="申込"
        description="お客様に渡す申込URLを発行し、フォームから送信された申込内容を確認・顧客登録します。"
      />

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryTile label="申込 合計" value={`${applications.length}件`} />
        <SummaryTile label="未対応" value={`${submitted}件`} accent={submitted > 0} />
        <SummaryTile label="顧客登録済" value={`${registered}件`} />
        <SummaryTile
          label="有効なURL"
          value={`${links.filter((l) => l.active).length}件`}
        />
      </div>

      <div className="mb-6">
        <ApplicationLinkManager links={links} baseUrl={appUrl?.replace(/\/$/, "") ?? ""} />
      </div>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">申込一覧</h2>
        {applications.length === 0 ? (
          <EmptyState
            title="申込がありません"
            description="上の「申込URLを発行」からURLを作成してお客様にお渡しすると、送信された内容がここに表示されます。"
            icon={<Inbox className="h-5 w-5" />}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>法人名 / 個人名</TH>
                <TH>代表者 / ご担当者</TH>
                <TH>連絡先</TH>
                <TH>希望連携</TH>
                <TH>ステータス</TH>
                <TH>受付日時</TH>
                <TH>申込URL</TH>
              </TR>
            </THead>
            <TBody>
              {applications.map((a) => {
                const services = requestedServices(a);
                return (
                  <TR key={a.id}>
                    <TD primary>
                      <Link
                        href={`/applications/${a.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {a.companyName}
                      </Link>
                      <div className="max-w-[22rem] truncate text-xs text-muted-foreground">
                        {a.address}
                      </div>
                    </TD>
                    <TD>
                      <div>
                        {a.representativeTitle ? `${a.representativeTitle} ` : ""}
                        {a.representativeName || "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {a.contactName ? `担当: ${a.contactName}` : "担当: 代表者と同じ"}
                      </div>
                    </TD>
                    <TD className="text-xs">
                      <div className="tabular">{a.phone || "—"}</div>
                      <div className="max-w-[14rem] truncate text-muted-foreground">
                        {a.email || "—"}
                      </div>
                    </TD>
                    <TD className="text-xs">
                      {services.length ? services.join(" / ") : "なし"}
                    </TD>
                    <TD>
                      <ApplicationStatusBadge status={a.status} />
                    </TD>
                    <TD className="tabular text-xs">{formatDateTime(a.submittedAt)}</TD>
                    <TD className="text-xs text-muted-foreground">{a.linkName || "—"}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function SummaryTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`tabular mt-0.5 text-lg font-bold ${accent ? "text-warning" : ""}`}>
        {value}
      </div>
    </div>
  );
}
