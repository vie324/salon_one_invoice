import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getServiceRepository } from "@/lib/data";
import { paymentMethodLabels } from "@/lib/domain/constants";
import { nssStage, type NssStage } from "@/lib/domain/nss";
import { NewCustomerButton } from "./new-customer-button";

export const metadata = { title: "顧客" };

const NSS_SHORT: Record<NssStage, string> = {
  not_started: "未着手",
  form_sent: "依頼書 郵送済",
  form_received: "依頼書 回収済",
  submitted: "NSS登録待ち",
  active: "登録完了",
  failed: "不備・再提出",
  revoked: "停止",
};

const NSS_TONE: Record<NssStage, "neutral" | "info" | "warning" | "success" | "danger"> = {
  not_started: "neutral",
  form_sent: "info",
  form_received: "warning",
  submitted: "info",
  active: "success",
  failed: "danger",
  revoked: "neutral",
};

// 一覧はデータ依存のため常にサーバーで描画する(静的化するとビルド時データが焼き込まれる)
export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const repo = await getServiceRepository();
  const [customers, invoices, mandates] = await Promise.all([
    repo.listCustomers(),
    repo.listInvoices(),
    repo.listMandates(),
  ]);
  const mandateMap = new Map(mandates.map((m) => [m.customerId, m]));

  const outstandingByCustomer = new Map<string, number>();
  for (const inv of invoices) {
    if (["paid", "canceled", "draft"].includes(inv.status)) continue;
    outstandingByCustomer.set(
      inv.customerId,
      (outstandingByCustomer.get(inv.customerId) ?? 0) + (inv.total - inv.amountPaid),
    );
  }

  return (
    <div>
      <PageHeader
        title="顧客"
        description="会員・取引先の管理と、口座振替（NSS）の登録状況を確認できます。申込から運用開始までの進み具合は「受注管理」で追います。"
        actions={<NewCustomerButton />}
      />
      <Card>
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>コード</TH>
              <TH>顧客名</TH>
              <TH>支払方法</TH>
              <TH>口座振替（NSS）</TH>
              <TH>担当</TH>
              <TH>メモ</TH>
              <TH className="text-right">未収</TH>
              <TH>状態</TH>
            </TR>
          </THead>
          <TBody>
            {customers.map((c) => {
              const mandate = mandateMap.get(c.id);
              const outstanding = outstandingByCustomer.get(c.id) ?? 0;
              return (
                <TR key={c.id}>
                  <TD className="tabular text-muted-foreground">{c.code}</TD>
                  <TD primary>
                    <Link href={`/customers/${c.id}`} className="font-medium hover:text-primary hover:underline">
                      {c.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{c.kana}</div>
                  </TD>
                  <TD className="text-muted-foreground">{paymentMethodLabels[c.paymentMethod]}</TD>
                  <TD>
                    {c.paymentMethod === "direct_debit" ? (
                      <Badge tone={NSS_TONE[nssStage(mandate ?? null)]}>
                        {NSS_SHORT[nssStage(mandate ?? null)]}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TD>
                  <TD className="text-muted-foreground">{c.assignee || "—"}</TD>
                  <TD className="max-w-[220px]">
                    {c.notes ? (
                      <span
                        className="block truncate text-xs text-muted-foreground"
                        title={c.notes}
                      >
                        {c.notes}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TD>
                  <TD className="tabular text-right">
                    {outstanding > 0 ? (
                      <span className="font-medium text-warning">
                        {outstanding.toLocaleString("ja-JP", { style: "currency", currency: "JPY" })}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TD>
                  <TD>
                    <Badge tone={c.status === "active" ? "success" : "neutral"} dot>
                      {c.status === "active" ? "稼働中" : "休止"}
                    </Badge>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
