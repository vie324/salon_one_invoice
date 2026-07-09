import Link from "next/link";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { outstandingAmount } from "@/lib/domain/calculations";
import { invoiceTypeLabels, paymentMethodShort } from "@/lib/domain/constants";
import type { InvoiceWithCustomer } from "@/lib/domain/types";
import { formatDate, formatJPY } from "@/lib/utils";

export function InvoiceTable({
  invoices,
  hideCustomer = false,
}: {
  invoices: InvoiceWithCustomer[];
  hideCustomer?: boolean;
}) {
  if (invoices.length === 0) {
    return <EmptyState title="請求書がありません" description="条件に一致する請求書は見つかりませんでした。" />;
  }
  return (
    <Table>
      <THead>
        <TR className="hover:bg-transparent">
          <TH>請求書番号</TH>
          {!hideCustomer && <TH>顧客</TH>}
          <TH>区分</TH>
          <TH>発行日</TH>
          <TH>支払期限</TH>
          <TH className="text-right">金額</TH>
          <TH className="text-right">未収</TH>
          <TH>状態</TH>
        </TR>
      </THead>
      <TBody>
        {invoices.map((inv) => {
          const outstanding = outstandingAmount(inv);
          return (
            <TR key={inv.id} className="cursor-pointer">
              <TD className="font-medium">
                <Link href={`/invoices/${inv.id}`} className="hover:text-primary hover:underline">
                  {inv.invoiceNumber}
                </Link>
              </TD>
              {!hideCustomer && (
                <TD>
                  <div className="font-medium">{inv.customer?.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {paymentMethodShort[inv.paymentMethod]}
                  </div>
                </TD>
              )}
              <TD>
                <Badge tone={inv.type === "recurring" ? "primary" : inv.type === "initial" ? "info" : "neutral"}>
                  {invoiceTypeLabels[inv.type]}
                </Badge>
              </TD>
              <TD className="whitespace-nowrap text-muted-foreground">{formatDate(inv.issueDate)}</TD>
              <TD className="whitespace-nowrap text-muted-foreground">{formatDate(inv.dueDate)}</TD>
              <TD className="tabular text-right font-medium">{formatJPY(inv.total)}</TD>
              <TD className="tabular text-right">
                {outstanding > 0 ? (
                  <span className="font-medium text-foreground">{formatJPY(outstanding)}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TD>
              <TD>
                <InvoiceStatusBadge status={inv.status} />
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
