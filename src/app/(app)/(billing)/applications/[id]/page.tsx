import { ArrowLeft, Building2, MapPin, User } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApplicationStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getServiceRepository } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";
import { ApplicationActions, CredentialsPanel } from "./application-detail-client";

export const metadata = { title: "申込の詳細" };

export const dynamic = "force-dynamic";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repo = await getServiceRepository();
  const app = await repo.getApplication(id);
  if (!app) notFound();
  const customer = app.customerId ? await repo.getCustomer(app.customerId) : null;

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/applications"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          申込一覧へ
        </Link>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">
            {app.linkName ? `申込URL: ${app.linkName}` : "申込"}
          </div>
          <h1 className="mt-0.5 text-xl font-bold tracking-tight sm:text-2xl">{app.companyName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ApplicationStatusBadge status={app.status} />
            {app.lineRequested ? (
              <Badge tone="success">LINE連携 申込あり</Badge>
            ) : (
              <Badge tone="neutral">LINE連携 なし</Badge>
            )}
            <span className="text-xs text-muted-foreground">
              受付 {formatDateTime(app.submittedAt)}
            </span>
          </div>
        </div>
        <ApplicationActions
          applicationId={app.id}
          status={app.status}
          customerId={app.customerId}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>申込内容</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Row icon={<Building2 className="h-4 w-4" />} label="法人名（個人の場合、個人名）">
                {app.companyName}
              </Row>
              <Row icon={<MapPin className="h-4 w-4" />} label="住所（法人の場合、登記住所）">
                {app.address || "—"}
              </Row>
              <Row icon={<User className="h-4 w-4" />} label="代表者">
                {[app.representativeTitle, app.representativeName].filter(Boolean).join(" ") || "—"}
              </Row>
            </CardContent>
          </Card>

          <CredentialsPanel applicationId={app.id} application={app} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>受付情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Meta label="受付日時" value={formatDateTime(app.submittedAt)} />
              <Meta label="申込URL" value={app.linkName || "—"} />
              <Meta label="送信元IP" value={app.submittedIp || "—"} />
              <Meta label="LINE連携申込" value={app.lineRequested ? "あり" : "なし"} />
              <div>
                <div className="text-xs text-muted-foreground">顧客</div>
                <div className="mt-0.5">
                  {customer ? (
                    <Link
                      href={`/customers/${customer.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {customer.code} {customer.name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">未登録</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-0.5 break-words text-sm font-medium">{children}</div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 break-words">{value}</div>
    </div>
  );
}
