import { Badge } from "@/components/ui/badge";
import {
  batchItemResultLabels,
  batchItemResultTone,
  batchStatusLabels,
  batchStatusTone,
  contractStatusLabels,
  contractStatusTone,
  devIssueCategoryLabels,
  devIssueCategoryTone,
  devIssueExecutionLabels,
  devIssueExecutionTone,
  devIssuePriorityLabels,
  devIssuePriorityTone,
  devIssueStatusLabels,
  devIssueStatusTone,
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
  ContractStatus,
  DevIssueCategory,
  DevIssueExecution,
  DevIssuePriority,
  DevIssueStatus,
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

export function ContractStatusBadge({ status }: { status: ContractStatus }) {
  return (
    <Badge tone={contractStatusTone[status]} dot>
      {contractStatusLabels[status]}
    </Badge>
  );
}

export function BatchStatusBadge({ status }: { status: BatchStatus }) {
  return <Badge tone={batchStatusTone[status]}>{batchStatusLabels[status]}</Badge>;
}

export function BatchItemResultBadge({ result }: { result: BatchItemResult }) {
  return <Badge tone={batchItemResultTone[result]}>{batchItemResultLabels[result]}</Badge>;
}

/* ---- 開発依頼 / 進捗管理 ---- */

export function DevIssueStatusBadge({ status }: { status: DevIssueStatus }) {
  return (
    <Badge tone={devIssueStatusTone[status]} dot>
      {devIssueStatusLabels[status]}
    </Badge>
  );
}

export function DevIssueCategoryBadge({ category }: { category: DevIssueCategory }) {
  return <Badge tone={devIssueCategoryTone[category]}>{devIssueCategoryLabels[category]}</Badge>;
}

export function DevIssuePriorityBadge({ priority }: { priority: DevIssuePriority }) {
  return <Badge tone={devIssuePriorityTone[priority]}>{devIssuePriorityLabels[priority]}</Badge>;
}

export function DevIssueExecutionBadge({
  execution,
  muted,
}: {
  execution: DevIssueExecution;
  /** 不具合など実行判定の対象外は「—」表示 */
  muted?: boolean;
}) {
  if (muted) return <span className="text-xs text-muted-foreground">—</span>;
  return <Badge tone={devIssueExecutionTone[execution]}>{devIssueExecutionLabels[execution]}</Badge>;
}
