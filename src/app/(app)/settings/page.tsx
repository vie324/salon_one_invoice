import { Building2, CreditCard, Database, Mail, ShieldCheck, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/lib/auth";
import { emailProvider, isDemoMode, paymentProvider } from "@/lib/config";
import { getServiceRepository } from "@/lib/data";
import { isProductAdmin, roleLabels } from "@/lib/domain/constants";
import type { UserProfile } from "@/lib/domain/types";
import { AccountManager } from "./account-manager";
import { ClaimAdminCard } from "./claim-admin-card";
import { SelfAccountActions } from "./self-account-actions";
import { SignOutButton } from "./sign-out-button";

export const metadata = { title: "設定" };

// 一覧はデータ依存のため常にサーバーで描画する(静的化するとビルド時データが焼き込まれる)
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [user, repo] = await Promise.all([getCurrentUser(), getServiceRepository()]);
  const org = await repo.getOrganization();

  // アカウント一覧。全体管理者の管理画面と「全体管理者が不在か」の判定に使う
  // (プロフィール読み取り失敗でも設定画面ごと落とさない)
  let profiles: UserProfile[] = [];
  let profilesLoaded = false;
  try {
    profiles = await repo.listUserProfiles();
    profilesLoaded = true;
  } catch {
    profiles = [];
  }
  const admin = isProductAdmin(user.role);
  const hasAdmin = profiles.some((p) => isProductAdmin(p.role));
  // 初期セットアップ: ログイン済みで全体管理者が1人もいないときだけ表示
  const showClaim = !admin && !!user.id && profilesLoaded && !hasAdmin;

  return (
    <div>
      <PageHeader title="設定" description="自社情報・アカウント・実行モード・連携プロバイダを確認します。" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle>自社情報（請求書の発行元）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="事業者名" value={org.name} />
            <Row label="住所" value={`〒${org.postalCode} ${org.address}`} />
            <Row label="電話 / メール" value={`${org.tel} / ${org.email}`} />
            <Row label="登録番号" value={org.registrationNumber} />
            <Row
              label="振込先"
              value={`${org.bankName} ${org.bankBranch} ${org.bankAccountType} ${org.bankAccountNumber}`}
            />
            <Row label="請求書番号 接頭辞" value={org.invoicePrefix} />
            <Row label="既定税率" value={`${Math.round(org.defaultTaxRate * 100)}%`} />
            <p className="pt-1 text-xs text-muted-foreground">
              ※ 本番では Supabase の organizations テーブルで管理します。
            </p>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              <CardTitle>実行モード</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">データストア</span>
                {isDemoMode ? (
                  <Badge tone="warning">デモ（インメモリ）</Badge>
                ) : (
                  <Badge tone="success">Supabase</Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <CreditCard className="h-4 w-4" /> 決済
                </span>
                <Badge tone={paymentProvider === "stripe" ? "primary" : "neutral"}>
                  {paymentProvider === "stripe" ? "Stripe" : "手動 / 収納代行"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Mail className="h-4 w-4" /> メール
                </span>
                <Badge tone={emailProvider === "resend" ? "primary" : "neutral"}>
                  {emailProvider === "resend" ? "Resend" : "コンソール（プレビュー）"}
                </Badge>
              </div>
              {isDemoMode && (
                <p className="rounded-md bg-secondary px-3 py-2 text-xs text-secondary-foreground">
                  <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
                  Supabase を設定すると認証・永続化・RLS が有効になります。手順は README を参照してください。
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>アカウント</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Row label="名前" value={user.name} />
              <Row label="メール" value={user.email || "—"} />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">アカウント種別</span>
                <Badge tone="primary">{roleLabels[user.role]}</Badge>
              </div>
              {user.id && (
                <div className="pt-1">
                  <SelfAccountActions userId={user.id} userName={user.name} demo={isDemoMode} />
                </div>
              )}
              {isDemoMode ? (
                <p className="text-xs text-muted-foreground">
                  デモモードでは、右上の「デモ」セレクトで全体管理者／請求管理のみ／開発進捗のみを切り替えられます。
                </p>
              ) : (
                <div className="pt-1">
                  <SignOutButton />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {showClaim && <ClaimAdminCard />}

      {admin && (
        <Card className="mt-6">
          <CardHeader className="flex-row items-center gap-2">
            <UsersRound className="h-5 w-5 text-primary" />
            <CardTitle>アカウント管理（全体管理者のみ）</CardTitle>
          </CardHeader>
          <CardContent>
            <AccountManager profiles={profiles} currentUserId={user.id} demo={isDemoMode} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
