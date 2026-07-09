import { Badge } from "@/components/ui/badge";
import {
  batchItemResultLabels,
  batchItemResultTone,
  batchStatusLabels,
  batchStatusTone,
  invoiceStatusLabels,
  invoiceStatusTone,
  mandateStatusLabels,
  mandateStatusTone,
  subscriptionStatusLabels,
  subscriptionStatusTone,
} from "@/lib/domain/constants";
import type {
  BatchItemResult,
  BatchStatus,
  InvoiceStatus,
  MandateStatus,
  SubscriptionStatus,
} from "@/lib/domain/types";

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <Badge tone={invoiceStatusTone[status]} dot>
      {invoiceStatusLabels[status]}
    </Badge>
  );
}

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  return (
    <Badge tone={subscriptionStatusTone[status]} dot>
      {subscriptionStatusLabels[status]}
    </Badge>
  );
}

export function MandateStatusBadge({ status }: { status: MandateStatus }) {
  return <Badge tone={mandateStatusTone[status]}>{mandateStatusLabels[status]}</Badge>;
}

export function BatchStatusBadge({ status }: { status: BatchStatus }) {
  return <Badge tone={batchStatusTone[status]}>{batchStatusLabels[status]}</Badge>;
}

export function BatchItemResultBadge({ result }: { result: BatchItemResult }) {
  return <Badge tone={batchItemResultTone[result]}>{batchItemResultLabels[result]}</Badge>;
}
