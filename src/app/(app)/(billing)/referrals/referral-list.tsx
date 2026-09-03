"use client";

import { AlertTriangle, UserPlus } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import {
  createCustomerFromReferralAction,
  linkReferrerCustomerAction,
  setReferralRewardStatusAction,
  updateReferralStatusAction,
} from "@/app/actions/referrals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  referralContactMethodShort,
  referralRewardStatusLabels,
  referralRewardStatusTone,
  referralStatusLabels,
  referralStatusTone,
  referralTimeSlotLabels,
} from "@/lib/domain/constants";
import { contactValue, type ContactDue } from "@/lib/domain/referral";
import type { Referral, ReferralStatus } from "@/lib/domain/types";
import { cn, formatDate, formatJPY } from "@/lib/utils";

export type ReferralRow = Referral & { due: ContactDue };

const STATUSES: ReferralStatus[] = ["submitted", "contacted", "customer_created", "archived"];

/**
 * ご紹介の一覧。
 * いちばん急ぐのは「連絡希望日時までに連絡すること」なので、
 * 希望日を過ぎたもの・今日のものを目立たせ、連絡すべき順に並べている。
 */
export function ReferralList({
  rows,
  customers,
}: {
  rows: ReferralRow[];
  customers: { id: string; name: string }[];
}) {
  return (
    <Table mobile="cards">
      <THead>
        <TR>
          <TH className="whitespace-nowrap">対応</TH>
          <TH className="min-w-[180px]">ご紹介を受けた方</TH>
          <TH className="min-w-[160px]">ご紹介者</TH>
          <TH className="min-w-[190px]">連絡のご希望</TH>
          <TH className="min-w-[170px]">謝礼（初期費用の25%）</TH>
          <TH className="whitespace-nowrap">受付日</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((row) => (
          <Row key={row.id} row={row} customers={customers} />
        ))}
      </TBody>
    </Table>
  );
}

function Row({ row, customers }: { row: ReferralRow; customers: { id: string; name: string }[] }) {
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState("");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError("");
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "操作に失敗しました");
    });
  };

  return (
    <TR className={cn(row.due.overdue && "bg-destructive/5")}>
      <TD>
        <Select
          value={row.status}
          disabled={pending}
          onChange={(e) => run(() => updateReferralStatusAction(row.id, e.target.value as ReferralStatus))}
          className="h-9 w-32 text-xs"
          aria-label={`${row.contactName} 様の対応状況`}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {referralStatusLabels[s]}
            </option>
          ))}
        </Select>
        <div className="mt-1">
          <Badge tone={referralStatusTone[row.status]}>{referralStatusLabels[row.status]}</Badge>
        </div>
      </TD>

      <TD primary>
        <div className="font-medium">{row.companyName || row.contactName}</div>
        {row.companyName && (
          <div className="text-xs text-muted-foreground">{row.contactName} 様</div>
        )}
        <div className="tabular mt-0.5 text-xs text-muted-foreground">{contactValue(row)}</div>
        {row.note && <div className="mt-1 text-xs text-muted-foreground">{row.note}</div>}
        {row.customerId ? (
          <Link
            href={`/customers/${row.customerId}`}
            className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
          >
            顧客ページを開く
          </Link>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="mt-1.5"
            disabled={pending}
            onClick={() => run(() => createCustomerFromReferralAction(row.id))}
          >
            <UserPlus className="h-3.5 w-3.5" />
            顧客として登録
          </Button>
        )}
      </TD>

      <TD>
        <div className="font-medium">{row.referrerName || "（未記入）"}</div>
        {/* 顧客に紐付けると、謝礼のお支払い先と特典の判定がつながる */}
        <Select
          value={row.referrerCustomerId ?? ""}
          disabled={pending}
          onChange={(e) => run(() => linkReferrerCustomerAction(row.id, e.target.value || null))}
          className="mt-1 h-9 text-xs"
          aria-label={`${row.referrerName} の顧客紐付け`}
        >
          <option value="">顧客に未紐付け</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </TD>

      <TD>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="info">{referralContactMethodShort[row.contactMethod]}</Badge>
          {row.due.overdue && (
            <Badge tone="danger">
              <AlertTriangle className="h-3 w-3" />
              希望日 超過
            </Badge>
          )}
          {row.due.today && <Badge tone="warning">本日</Badge>}
        </div>
        <div className="mt-1 text-sm">
          {row.preferredDate ? formatDate(row.preferredDate) : "日付の指定なし"}
        </div>
        <div className="text-xs text-muted-foreground">
          {referralTimeSlotLabels[row.preferredTimeSlot]}
        </div>
      </TD>

      <TD>
        <div className="tabular font-medium">
          {row.rewardAmount > 0 ? formatJPY(row.rewardAmount) : "—"}
        </div>
        <div className="mt-0.5">
          <Badge tone={referralRewardStatusTone[row.rewardStatus]}>
            {referralRewardStatusLabels[row.rewardStatus]}
          </Badge>
        </div>
        {row.rewardBaseAmount > 0 && (
          <div className="mt-0.5 text-xs text-muted-foreground">
            初期費用 {formatJPY(row.rewardBaseAmount)}
          </div>
        )}
        {row.rewardStatus === "payable" && (
          <Button
            variant="outline"
            size="sm"
            className="mt-1.5"
            disabled={pending}
            onClick={() => run(() => setReferralRewardStatusAction(row.id, "paid"))}
          >
            お支払い済にする
          </Button>
        )}
        {row.rewardStatus === "pending" && (
          <div className="mt-0.5 text-xs text-muted-foreground">
            初回請求の作成時に自動で入ります
          </div>
        )}
      </TD>

      <TD className="whitespace-nowrap text-xs text-muted-foreground">
        {formatDate(row.submittedAt)}
        {error && <div className="mt-1 text-destructive">{error}</div>}
      </TD>
    </TR>
  );
}
