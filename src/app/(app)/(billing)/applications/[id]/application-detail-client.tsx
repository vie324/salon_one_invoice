"use client";

import { UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  createCustomerFromApplicationAction,
  updateApplicationStatusAction,
} from "@/app/actions/applications";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { applicationStatusLabels } from "@/lib/domain/constants";
import type { ApplicationStatus } from "@/lib/domain/types";

export { CredentialsPanel } from "@/components/orders/credentials-panel";

const STATUS_OPTIONS: ApplicationStatus[] = ["submitted", "customer_created", "archived"];

/** 顧客登録・対応状況の変更 */
export function ApplicationActions({
  applicationId,
  status,
  customerId,
}: {
  applicationId: string;
  status: ApplicationStatus;
  customerId: string | null;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

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
      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="w-40"
          value={status}
          onChange={(e) => changeStatus(e.target.value as ApplicationStatus)}
          disabled={pending}
          aria-label="対応状況"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {applicationStatusLabels[s]}
            </option>
          ))}
        </Select>
        {!customerId && (
          <Button onClick={register} disabled={pending}>
            <UserPlus className="h-4 w-4" />
            {pending ? "登録中…" : "顧客として登録"}
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
