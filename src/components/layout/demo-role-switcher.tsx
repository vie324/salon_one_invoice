"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { switchDemoRole } from "@/app/actions/session";

/**
 * デモモード専用: アカウントを切り替えて各役割の画面を試せる。
 * 管理者(承認者)は2名用意し、要望の承諾フローも確認できる。
 * 酒井・若林は開発スケジュールの閲覧を許可されたメンバーの例。
 */
const personas: { value: string; profileId: string; label: string }[] = [
  { value: "admin", profileId: "demo-admin-1", label: "管理者（佐々木）" },
  { value: "admin2", profileId: "demo-admin-2", label: "管理者（高橋）" },
  { value: "billing", profileId: "demo-billing-1", label: "請求＋開発管理 兼務（田中）" },
  { value: "dev", profileId: "demo-dev-1", label: "エンジニア（山田）" },
  { value: "dev_manager", profileId: "demo-devmgr-1", label: "開発・修正管理者（小林）" },
  // スケジュール表の閲覧をオンにしてある2名(管理者以外の見え方を確認できる)
  { value: "sakai", profileId: "demo-sakai", label: "スケジュール閲覧可（酒井）" },
  { value: "wakabayashi", profileId: "demo-wakabayashi", label: "スケジュール閲覧可（若林）" },
];

export function DemoRoleSwitcher({ currentId }: { currentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const current = personas.find((p) => p.profileId === currentId)?.value ?? "admin";

  return (
    <label className="hidden items-center gap-1.5 lg:flex">
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
        className="h-9 rounded-md border border-input bg-card px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
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
