"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { switchDemoRole } from "@/app/actions/session";

/**
 * デモモード専用: アカウントを切り替えて3種の権限を試せる。
 * 全体管理者は2名用意し、「実行有無」の2名承諾フローも確認できる。
 */
const personas: { value: string; profileId: string; label: string }[] = [
  { value: "admin", profileId: "demo-admin-1", label: "全体管理者（佐々木）" },
  { value: "admin2", profileId: "demo-admin-2", label: "全体管理者（高橋）" },
  { value: "billing", profileId: "demo-billing-1", label: "請求管理のみ（田中）" },
  { value: "dev", profileId: "demo-dev-1", label: "開発進捗のみ（山田）" },
];

export function DemoRoleSwitcher({ currentId }: { currentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const current = personas.find((p) => p.profileId === currentId)?.value ?? "admin";

  return (
    <label className="hidden items-center gap-1.5 sm:flex">
      <span className="text-[11px] text-muted-foreground">デモ:</span>
      <select
        value={current}
        disabled={pending}
        onChange={(e) =>
          startTransition(async () => {
            // ログイン中のデモアカウントを切り替える(ログイン状態は維持)
            await switchDemoRole(e.target.value);
            router.push("/");
            router.refresh();
          })
        }
        className="h-8 rounded-md border border-input bg-card px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        aria-label="デモアカウントを切り替え"
      >
        {personas.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
    </label>
  );
}
