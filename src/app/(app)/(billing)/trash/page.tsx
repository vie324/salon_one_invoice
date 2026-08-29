import { History, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  ENTITY_LABELS,
  RestoreRecordButton,
} from "@/components/records/delete-record-button";
import { getServiceRepository } from "@/lib/data";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "ゴミ箱" };

export const dynamic = "force-dynamic";

/**
 * 削除したデータの一覧と復元。
 * 削除はデータを消さず非表示にするだけなので、ここから元に戻せる。
 * 操作ログ(誰が・いつ・なぜ)も同じ画面で確認できる。
 */
export default async function TrashPage() {
  const repo = await getServiceRepository();
  const [records, logs] = await Promise.all([
    repo.listDeletedRecords(),
    repo.listDeletionLogs(100),
  ]);

  return (
    <div>
      <PageHeader
        title="ゴミ箱"
        description="削除したデータはここに残ります。実データは消えていないので、いつでも元に戻せます。"
      />

      <Card className="mb-6">
        <CardHeader className="flex-row items-center gap-2">
          <Trash2 className="h-5 w-5 text-muted-foreground" />
          <CardTitle>削除済みのデータ（{records.length}件）</CardTitle>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <EmptyState
              title="削除したデータはありません"
              description="請求書・顧客・入金・定期契約・銀行明細・口座振替バッチの各画面から削除すると、ここに入ります。"
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="whitespace-nowrap">種別</TH>
                  <TH className="min-w-[220px]">対象</TH>
                  <TH>削除の理由</TH>
                  <TH className="whitespace-nowrap">削除者 / 日時</TH>
                  <TH className="w-24 text-right">操作</TH>
                </TR>
              </THead>
              <TBody>
                {records.map((r) => (
                  <TR key={`${r.entity}-${r.id}`}>
                    <TD>
                      <Badge tone="neutral">{ENTITY_LABELS[r.entity]}</Badge>
                    </TD>
                    <TD primary>
                      <div className="font-medium">{r.label}</div>
                      {r.sublabel && (
                        <div className="text-xs text-muted-foreground">{r.sublabel}</div>
                      )}
                    </TD>
                    <TD className="text-sm text-muted-foreground">{r.reason || "—"}</TD>
                    <TD className="whitespace-nowrap text-xs text-muted-foreground">
                      {r.deletedBy || "—"}
                      <div>{formatDateTime(r.deletedAt)}</div>
                    </TD>
                    <TD>
                      <RestoreRecordButton entity={r.entity} id={r.id} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <History className="h-5 w-5 text-muted-foreground" />
          <CardTitle>操作ログ</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">操作ログはまだありません。</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {logs.map((log) => (
                <li key={log.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <Badge tone={log.action === "delete" ? "danger" : "success"}>
                    {log.action === "delete" ? "削除" : "復元"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {ENTITY_LABELS[log.entity]}
                  </span>
                  <span className="font-medium">{log.entityLabel || log.entityId}</span>
                  {log.reason && (
                    <span className="text-xs text-muted-foreground">理由: {log.reason}</span>
                  )}
                  <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">
                    {log.actor} ・ {formatDateTime(log.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            ※ 操作ログは追記のみで、あとから変更・削除はできません（本番DBではトリガーで保護）。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
