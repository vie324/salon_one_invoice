"use client";

import { Eye, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { setScheduleVisibilityAction } from "@/app/actions/dev-schedule";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { isProductAdmin, roleLabels } from "@/lib/domain/constants";
import type { Role } from "@/lib/domain/types";

export interface ScheduleMember {
  id: string;
  name: string;
  roles: Role[];
  scheduleVisible: boolean;
}

/**
 * スケジュール表を見せるメンバーの設定(管理者のみ)。
 * チェックを入れた人だけが /dev/schedule を開ける。
 * 管理者は表の管理者自身なので、常に閲覧できる扱いにして締め出しを防ぐ。
 */
export function ViewerPanel({ members }: { members: ScheduleMember[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");
  // サーバーの再検証が返るまでのあいだ、チェックの見た目を先に合わせる
  const [optimistic, setOptimistic] = React.useState<Record<string, boolean>>({});

  const visibleOf = (m: ScheduleMember) => optimistic[m.id] ?? m.scheduleVisible;

  const toggle = async (member: ScheduleMember, next: boolean) => {
    setError("");
    setPendingId(member.id);
    setOptimistic((o) => ({ ...o, [member.id]: next }));
    const res = await setScheduleVisibilityAction(member.id, next);
    setPendingId(null);
    if (!res.ok) {
      setOptimistic((o) => ({ ...o, [member.id]: !next }));
      setError(res.error);
      return;
    }
    router.refresh();
  };

  const admins = members.filter((m) => isProductAdmin(m.roles));
  const others = members.filter((m) => !isProductAdmin(m.roles));
  const shownCount = admins.length + others.filter(visibleOf).length;

  return (
    <Card className="p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">この表を見られるメンバー</h2>
        <Badge tone="neutral">{shownCount}名</Badge>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        チェックを入れたメンバーだけが開発スケジュールを開けます。管理者は表の管理者のため常に閲覧できます。
      </p>

      <div className="space-y-2">
        {others.map((m) => (
          <label
            key={m.id}
            className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-2.5 text-sm transition-colors hover:bg-muted/50"
          >
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
              checked={visibleOf(m)}
              disabled={pendingId === m.id}
              onChange={(e) => toggle(m, e.target.checked)}
            />
            <span className="min-w-0">
              <span className="font-medium">{m.name || "（名前未設定）"}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {m.roles.map((r) => roleLabels[r]).join("・")}
              </span>
            </span>
          </label>
        ))}

        {admins.map((m) => (
          <div
            key={m.id}
            className="flex items-start gap-3 rounded-md border border-dashed border-border p-2.5 text-sm"
          >
            <Eye className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="font-medium">{m.name || "（名前未設定）"}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {roleLabels.admin} — 常に閲覧できます
              </span>
            </span>
          </div>
        ))}

        {members.length === 0 && (
          <p className="text-sm text-muted-foreground">登録されているメンバーがいません。</p>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </Card>
  );
}
