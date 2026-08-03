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
8. `0008_agencies_pricing.sql` … 営業代理店・営業マン・個別料金
9. （任意）`seed.sql` … 初期データ（自社情報・料金プラン）

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
   | `RESEND_API_KEY` |  | メールを実際に送る場合（→ [5. メールを実際に送る設定](#5-メールを実際に送る設定)） |
   | `EMAIL_FROM` |  | 送信元アドレス。実送信時は必須 |
   | `NEXT_PUBLIC_APP_URL` |  | 公開URL。メール内リンク（署名URL等）に使用 |
   | `EMAIL_PROVIDER` |  | 通常は設定不要。`console` で強制的に未送信 |

4. **Deploy**。

> 環境変数を設定しないままデプロイすると、公開状態でも **デモモード** で動作します（サンプルデータ・非永続）。本番では必ず Supabase 変数を設定してください。

## 5. メールを実際に送る設定

既定ではメールは**送信されません**（サーバーログに出力するプレビューのみ）。契約書の署名依頼・締結完了通知、請求書、代理店の支払明細をお客様へ実際に届けるには、以下を設定します。

1. [Resend](https://resend.com) にサインアップし、**Domains** で自社ドメインを追加。表示された DNS レコード（SPF / DKIM）をドメインの DNS に登録して認証を完了する。
   - ドメインを持っていない場合、認証なしでは自分のアカウントのアドレス宛にしか送れません。お客様へ送るには認証が必須です。
2. **API Keys** で送信用のキーを発行する（`re_` で始まる文字列）。
3. Vercel の **Settings → Environment Variables** に設定する。

   | 変数 | 例 | 説明 |
   | --- | --- | --- |
   | `RESEND_API_KEY` | `re_xxxxxxxx` | 手順2で発行したキー。設定するだけで実送信モードになる |
   | `EMAIL_FROM` | `請求 <billing@example.jp>` | 手順1で**認証したドメイン**のアドレス |
   | `NEXT_PUBLIC_APP_URL` | `https://example.vercel.app` | メール内のリンク（署名URL・請求書URL）の基準 |

4. **再デプロイ**する（環境変数は再デプロイで反映されます）。
5. アプリの **設定 → メール送信** を開く。

   - 「送信モード」が **実送信（お客様に届きます）** になっていることを確認。
   - 全体管理者は **テスト送信** で自分のアドレス宛に届くか確認できます（お客様には送信されません）。

> プレビュー（未送信）に戻したいときは `EMAIL_PROVIDER=console` を設定します。`RESEND_API_KEY` を消さずに一時停止できます。

## 6. 定期請求 Cron の確認

- [`vercel.json`](vercel.json) に日次スケジュール（`0 1 * * *`）を定義済み。Vercel が自動で `/api/cron/generate-invoices` を呼び出します。
- Vercel のダッシュボード **Settings → Cron Jobs** で稼働を確認できます。
- 手動テスト:
  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>.vercel.app/api/cron/generate-invoices
  ```

## 7. 動作確認チェックリスト

- [ ] ログインできる（`/login`）
- [ ] ダッシュボードに数値が表示される
- [ ] 請求書を作成 → 送付 → 入金記録できる
- [ ] 口座振替バッチを作成 → CSV 出力 → 処理できる
- [ ] 入金確認で銀行明細 CSV を取込 → 消し込みできる
- [ ] 定期請求を生成できる（画面ボタン or Cron）
- [ ] ダッシュボードの月タブで先月・先々月の実績を切り替えられる
- [ ] 「設定 → メール送信」が **実送信** になっていて、テスト送信が届く

---

## トラブルシューティング

| 症状 | 対処 |
| --- | --- |
| ログイン後に何も表示されない | migrations 未適用の可能性。`0001`〜`0003` を実行。 |
| 保存・作成後に「ページが見つかりません」になる / 保存時に `SUPABASE_SERVICE_ROLE_KEY が未設定…` と表示される | `SUPABASE_SERVICE_ROLE_KEY` が未設定。Vercel の環境変数に service_role キーを設定し、再デプロイ。 |
| 「デモモード」と表示される | `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` が未設定。 |
| Cron が動かない | `CRON_SECRET` 未設定、または Vercel の Cron 権限を確認。 |
| メールが届かない | 「設定 → メール送信」で状態を確認。既定は未送信（プレビュー）です。`RESEND_API_KEY` / `EMAIL_FROM` を設定して再デプロイ（→ [5. メールを実際に送る設定](#5-メールを実際に送る設定)）。 |
| テスト送信で「ドメインが認証済みか確認してください」と出る | `EMAIL_FROM` のドメインが Resend で未認証。Resend の Domains で DNS 認証を完了させる。 |
| メール内のリンクが `localhost` などになる | `NEXT_PUBLIC_APP_URL` に公開URLを設定して再デプロイ。 |
