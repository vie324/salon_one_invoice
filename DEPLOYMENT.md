# デプロイ手順（Vercel + Supabase）

本アプリを本番運用するための手順です。所要時間の目安は 15〜20 分。

## 1. Supabase プロジェクトの作成

1. [supabase.com](https://supabase.com) で新規プロジェクトを作成。
2. **Project Settings → API** から次を控える:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` キー → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` キー → `SUPABASE_SERVICE_ROLE_KEY`（サーバー専用・非公開）

## 2. データベースの構築

**SQL Editor** で、`supabase/migrations` 内のファイルを番号順に実行します。

1. `0001_init.sql` … テーブル・インデックス
2. `0002_rls.sql` … Row Level Security ポリシー
3. `0003_functions.sql` … サインアップ時の profiles 自動作成ほか
4. `0004_stripe.sql` … Stripe 連携カラム
5. `0005_stripe_unique.sql` … Stripe サブスクの一意制約
6. `0006_plan_options.sql` … 料金プランのオプション/初期費用/期間区分
7. `0007_contracts.sql` … 契約書・電子契約（内容凍結/追記専用トリガー・RLS）
8. （任意）`seed.sql` … 初期サンプルデータ

> 電子契約の公開署名ページ（`/sign/<token>`）はサービスロールでデータへアクセスします。
> `SUPABASE_SERVICE_ROLE_KEY` と、署名リンクの絶対URL用に `NEXT_PUBLIC_APP_URL` を必ず設定してください。

> Supabase CLI を使う場合:
> ```bash
> supabase link --project-ref <your-ref>
> supabase db push
> psql "$SUPABASE_DB_URL" -f supabase/seed.sql   # 任意
> ```

## 3. 認証ユーザーの作成

- **Authentication → Users → Add user** で担当者アカウントを作成。
- サインアップ時にトリガーで `profiles` が作成されます（既定 `role = staff`）。
- 経営者・管理者にするには、`profiles` の `role` を `owner` / `admin` に更新:
  ```sql
  update profiles set role = 'owner' where id = '<user-uuid>';
  ```

## 4. Vercel へデプロイ

1. 本リポジトリを GitHub に push。
2. [vercel.com](https://vercel.com) → **New Project** → リポジトリを Import。
3. **Environment Variables** に以下を設定:

   | 変数 | 必須 | 説明 |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | anon キー |
   | `SUPABASE_SERVICE_ROLE_KEY` | ✅ | service_role キー（Cron 用） |
   | `CRON_SECRET` | ✅ | Cron 保護用の任意文字列 |
   | `PAYMENT_PROVIDER` |  | `manual`（既定）/ `stripe` |
   | `STRIPE_SECRET_KEY` |  | Stripe 利用時 |
   | `EMAIL_PROVIDER` |  | `console`（既定）/ `resend` |
   | `RESEND_API_KEY` / `EMAIL_FROM` |  | Resend 実送信時 |

4. **Deploy**。

> 環境変数を設定しないままデプロイすると、公開状態でも **デモモード** で動作します（サンプルデータ・非永続）。本番では必ず Supabase 変数を設定してください。

## 5. 定期請求 Cron の確認

- [`vercel.json`](vercel.json) に日次スケジュール（`0 1 * * *`）を定義済み。Vercel が自動で `/api/cron/generate-invoices` を呼び出します。
- Vercel のダッシュボード **Settings → Cron Jobs** で稼働を確認できます。
- 手動テスト:
  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>.vercel.app/api/cron/generate-invoices
  ```

## 6. 動作確認チェックリスト

- [ ] ログインできる（`/login`）
- [ ] ダッシュボードに数値が表示される
- [ ] 請求書を作成 → 送付 → 入金記録できる
- [ ] 口座振替バッチを作成 → CSV 出力 → 処理できる
- [ ] 入金確認で銀行明細 CSV を取込 → 消し込みできる
- [ ] 定期請求を生成できる（画面ボタン or Cron）

---

## トラブルシューティング

| 症状 | 対処 |
| --- | --- |
| ログイン後に何も表示されない | migrations 未適用の可能性。`0001`〜`0003` を実行。 |
| 「デモモード」と表示される | `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` が未設定。 |
| Cron が動かない | `CRON_SECRET` 未設定、または Vercel の Cron 権限を確認。 |
| メールが届かない | 既定は `console`（未送信）。`EMAIL_PROVIDER=resend` を設定。 |
