import {
  AlertTriangle,
  Building2,
  CalendarRange,
  CreditCard,
  Database,
  Mail,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { isDemoMode, paymentProvider } from "@/lib/config";
import { getServiceRepository } from "@/lib/data";
import { getEmailStatus } from "@/lib/email";
import { isProductAdmin, roleLabels, roleTone } from "@/lib/domain/constants";
import type { UserProfile } from "@/lib/domain/types";
import { AccountManager } from "./account-manager";
import { ClaimAdminCard } from "./claim-admin-card";
import { EmailTestForm } from "./email-test-form";
import { OrganizationForm } from "./organization-form";
import { ScheduleViewers } from "./schedule-viewers";
import { SelfAccountActions } from "./self-account-actions";
import { SignOutButton } from "./sign-out-button";

export const metadata = { title: "設定" };

// 一覧はデータ依存のため常にサーバーで描画する(静的化するとビルド時データが焼き込まれる)
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [user, repo] = await Promise.all([requireUser(), getServiceRepository()]);
  const org = await repo.getOrganization();
  const email = getEmailStatus();

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
  const admin = isProductAdmin(user.roles);
  const hasAdmin = profiles.some((p) => isProductAdmin(p.roles));
  // 初期セットアップ: 全体管理者が1人もいないときだけ表示
  const showClaim = !admin && profilesLoaded && !hasAdmin;

  return (
    <div>
      <PageHeader title="設定" description="自社情報（請求書の発行元）の編集・アカウント・実行モード・連携プロバイダの確認を行います。" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle>自社情報（請求書の発行元）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {admin ? (
              <>
                <p className="pb-1 text-xs text-muted-foreground">
                  ここで入力した内容が、請求書（画面・印刷）と請求書メール・代理店明細の
                  発行元欄にそのまま記載されます。
                </p>
                <OrganizationForm org={org} />
              </>
            ) : (
              <>
                <Row label="事業者名" value={org.name} />
                <Row label="住所" value={`〒${org.postalCode} ${org.address}`} />
                <Row label="電話 / メール" value={`${org.tel || "未設定"} / ${org.email || "未設定"}`} />
                <Row label="登録番号" value={org.registrationNumber || "未設定"} />
                <Row
                  label="振込先"
                  value={
                    org.bankName
                      ? `${org.bankName} ${org.bankBranch} ${org.bankAccountType} ${org.bankAccountNumber}`
                      : "未設定"
                  }
                />
                <Row label="請求書番号 接頭辞" value={org.invoicePrefix} />
                <Row label="既定税率" value={`${Math.round(org.defaultTaxRate * 100)}%`} />
                <p className="pt-1 text-xs text-muted-foreground">
                  ※ 変更できるのは管理者のみです。
                </p>
              </>
            )}
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
                <Badge tone={email.mode === "send" ? "success" : "warning"}>
                  {email.mode === "send" ? `実送信（${email.providerLabel}）` : "未送信（プレビュー）"}
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
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="shrink-0 text-muted-foreground">役割</span>
                <span className="flex flex-wrap justify-end gap-1">
                  {user.roles.map((r) => (
                    <Badge key={r} tone={roleTone[r]}>
                      {roleLabels[r]}
                    </Badge>
                  ))}
                </span>
              </div>
              <div className="pt-1">
                <SelfAccountActions userId={user.id} userName={user.name} demo={isDemoMode} />
              </div>
              {isDemoMode && (
                <p className="text-xs text-muted-foreground">
                  デモモードでは、右上の「デモ」セレクトでログイン中のアカウントを切り替えられます。
                </p>
              )}
              <div className="pt-1">
                <SignOutButton />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <CardTitle>メール送信（契約書の署名依頼・請求書・代理店明細）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">送信モード</span>
              <Badge tone={email.mode === "send" ? "success" : "warning"} dot>
                {email.mode === "send" ? "実送信（お客様に届きます）" : "未送信（プレビューのみ）"}
              </Badge>
            </div>
            <Row label="送信方法" value={email.providerLabel} />
            <Row label="送信元アドレス" value={email.from || "未設定"} />
            {email.smtp ? (
              <>
                <Row
                  label="SMTPサーバー"
                  value={`${email.smtp.host || "未設定"}:${email.smtp.port}（${email.smtp.encryption.toUpperCase()}）`}
                />
                <Row
                  label="SMTP認証"
                  value={email.smtp.hasAuth ? `あり（${email.smtp.user}）` : "なし（送信元IPで許可）"}
                />
              </>
            ) : (
              <Row label="Resend APIキー" value={email.hasApiKey ? "設定済み" : "未設定"} />
            )}
            <Row
              label="メール内リンクのURL"
              value={email.appUrl || "未設定（実行環境から自動判定）"}
            />
            <Row
              label="定期請求の請求書を自動送付"
              value={email.invoiceAutoEmail ? "有効" : "無効"}
            />
          </div>

          {email.warnings.length > 0 && (
            <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5 text-xs">
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                設定は揃っていますが、確認が必要です
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-muted-foreground">
                {email.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {email.issues.length > 0 && (
            <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5 text-xs">
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                実送信するために設定が必要です
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-muted-foreground">
                {email.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
              <p className="mt-2 text-muted-foreground">
                Google Workspace の SMTP リレーを使う場合は、Vercel の Environment Variables に
                <code>MAIL_HOST</code>（smtp-relay.gmail.com）・<code>MAIL_PORT</code>（587）・
                <code>MAIL_USERNAME</code> / <code>MAIL_PASSWORD</code>・<code>MAIL_FROM_ADDRESS</code>・
                <code>NEXT_PUBLIC_APP_URL</code> を設定して再デプロイしてください。詳細は DEPLOYMENT.md を参照してください。
              </p>
            </div>
          )}

          {admin ? (
            <div className="border-t border-border pt-3">
              <p className="mb-2 text-sm font-medium">テスト送信</p>
              <p className="mb-2 text-xs text-muted-foreground">
                お客様へ送る前に、自分のアドレスで実際に届くか確認できます（お客様には送信されません）。
              </p>
              <EmailTestForm defaultTo={user.email || org.email || ""} />
            </div>
          ) : (
            <p className="border-t border-border pt-3 text-xs text-muted-foreground">
              テスト送信は全体管理者のみ実行できます。
            </p>
          )}
        </CardContent>
      </Card>

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

      {admin && (
        <Card className="mt-6">
          <CardHeader className="flex-row items-center gap-2">
            <CalendarRange className="h-5 w-5 text-primary" />
            <CardTitle>開発スケジュールを見られるメンバー（全体管理者のみ）</CardTitle>
          </CardHeader>
          <CardContent>
            <ScheduleViewers
              members={profiles.map((p) => ({
                id: p.id,
                name: p.name,
                roles: p.roles,
                scheduleVisible: p.scheduleVisible,
              }))}
            />
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
      <span className="break-words text-right font-medium">{value}</span>
    </div>
  );
}
