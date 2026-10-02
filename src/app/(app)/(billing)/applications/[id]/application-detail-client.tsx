"use client";

import { ArrowRight, FilePlus2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  createCustomerFromApplicationAction,
  updateApplicationStatusAction,
} from "@/app/actions/applications";
import { Button, buttonClasses } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import type { ApplicationCustomerState } from "@/lib/domain/application";
import { applicationStatusLabels } from "@/lib/domain/constants";
import type { ApplicationStatus } from "@/lib/domain/types";
import { RegisterAndInvoiceButton } from "../register-invoice-button";

export { CredentialsPanel } from "@/components/orders/credentials-panel";

/**
 * 顧客登録・請求書の作成・対応状況の変更。
 * 「顧客登録済」は顧客を作ったときだけ付く(手で選べるのは「未対応」と「対応不要」)。
 */
export function ApplicationActions({
  applicationId,
  companyName,
  status,
  customerState,
  customerId,
  invoiceHref,
  awaitingConfirm,
}: {
  applicationId: string;
  companyName: string;
  status: ApplicationStatus;
  customerState: ApplicationCustomerState;
  /** 実在する顧客(削除済みなら null) */
  customerId: string | null;
  /** 請求書の作成画面のURL(顧客が実在するときだけ) */
  invoiceHref: string | null;
  /** 締結済みの契約書があり、受注確定を待っている */
  awaitingConfirm: boolean;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const registered = customerState === "registered";
  const options: ApplicationStatus[] = registered
    ? ["customer_created", "archived"]
    : ["submitted", "archived"];
  const selected: ApplicationStatus =
    status === "archived" ? "archived" : registered ? "customer_created" : "submitted";

  function register() {
    setError(null);
    start(async () => {
      const res = await createCustomerFromApplicationAction(applicationId);
      if (!res.ok) {
        setError(res.error ?? "顧客登録に失敗しました");
        return;
      }
      // 顧客登録後は受注管理の案件ページで、契約書の送付から続きを進める
      router.push(`/orders/${res.customerId}`);
    });
  }

  function changeStatus(next: ApplicationStatus) {
    setError(null);
    start(async () => {
      const res = await updateApplicationStatusAction(applicationId, next);
      if (!res.ok) setError(res.error ?? "更新に失敗しました");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <Select
          className="w-40"
          value={selected}
          onChange={(e) => changeStatus(e.target.value as ApplicationStatus)}
          disabled={pending}
          aria-label="対応状況"
        >
          {options.map((s) => (
            <option key={s} value={s}>
              {applicationStatusLabels[s]}
            </option>
          ))}
        </Select>
        {registered && customerId ? (
          awaitingConfirm ? (
            <Link href={`/orders/${customerId}`} className={buttonClasses()}>
              受注を確定して請求
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            invoiceHref && (
              <Link href={invoiceHref} className={buttonClasses()}>
                <FilePlus2 className="h-4 w-4" />
                請求書を作成
              </Link>
            )
          )
        ) : (
          <>
            <Button variant="outline" onClick={register} disabled={pending}>
              <UserPlus className="h-4 w-4" />
              {pending
                ? "登録中…"
                : customerState === "deleted"
                  ? "もう一度顧客として登録"
                  : "顧客として登録"}
            </Button>
            <RegisterAndInvoiceButton
              applicationId={applicationId}
              companyName={companyName}
              size="md"
              variant="primary"
              label={
                customerState === "deleted" ? "登録し直して請求書を作成" : "顧客登録して請求書を作成"
              }
            />
          </>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
