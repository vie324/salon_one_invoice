import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getRepository } from "@/lib/data";
import { paymentMethodLabels } from "@/lib/domain/constants";
import { NewCustomerButton } from "./new-customer-button";

export const metadata = { title: "顧客" };

// 一覧はデータ依存のため常にサーバーで描画する(静的化するとビルド時データが焼き込まれる)
export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const repo = await getRepository();
  const [customers, invoices] = await Promise.all([
    repo.listCustomers(),
    repo.listInvoices(),
  ]);
  const mandates = await Promise.all(
    customers.map(async (c) => ({ id: c.id, mandate: await repo.getMandateByCustomer(c.id) })),
  );
  const mandateMap = new Map(mandates.map((m) => [m.id, m.mandate]));

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
        description="会員・取引先の管理と、口座振替の登録状況を確認できます。"
        actions={<NewCustomerButton />}
      />
      <Card>
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>コード</TH>
              <TH>顧客名</TH>
              <TH>支払方法</TH>
              <TH>口座振替</TH>
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
                  <TD>
                    <Link href={`/customers/${c.id}`} className="font-medium hover:text-primary hover:underline">
                      {c.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{c.kana}</div>
                  </TD>
                  <TD className="text-muted-foreground">{paymentMethodLabels[c.paymentMethod]}</TD>
                  <TD>
                    {c.paymentMethod === "direct_debit" ? (
                      mandate ? (
                        <Badge
                          tone={
                            mandate.status === "active"
                              ? "success"
                              : mandate.status === "pending"
                                ? "warning"
                                : "danger"
                          }
                        >
                          {mandate.status === "active"
                            ? "登録済"
                            : mandate.status === "pending"
                              ? "手続き中"
                              : "要確認"}
                        </Badge>
                      ) : (
                        <Badge tone="neutral">未登録</Badge>
                      )
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
