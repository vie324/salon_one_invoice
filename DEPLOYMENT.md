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
9. `0009_dev_progress.sql` 〜 `0013_application_contact.sql` … 開発進捗・添付・申込
10. `0014_roles_and_soft_delete.sql` … **役割の複数割当（兼務）** と **削除・復元（ゴミ箱）＋操作ログ**
11. `0015_dev_issue_desired_date_order.sql` … 開発依頼の**希望完了日**と**手動の並び順**
12. （任意）`seed.sql` … 初期データ（自社情報・料金プラン）

> `0014` は既存アカウントの旧種別（`owner`/`staff`/`dev`）を新しい役割（管理者/請求管理者/エンジニア）へ自動で読み替えます。適用前でもアプリは動きますが、**兼務の設定とゴミ箱は `0014` の適用後に使えるようになります**。

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
   | `MAIL_HOST` ほか `MAIL_*` |  | SMTP でメールを送る場合（→ [5. メールを実際に送る設定](#5-メールを実際に送る設定)） |
   | `RESEND_API_KEY` / `EMAIL_FROM` |  | Resend で送る場合 |
   | `NEXT_PUBLIC_APP_URL` |  | 公開URL。メール内リンク（署名URL等）に使用 |
   | `EMAIL_PROVIDER` |  | 通常は設定不要。`console` で強制的に未送信 |

4. **Deploy**。

> 環境変数を設定しないままデプロイすると、公開状態でも **デモモード** で動作します（サンプルデータ・非永続）。本番では必ず Supabase 変数を設定してください。

## 5. メールを実際に送る設定

既定ではメールは**送信されません**（サーバーログに出力するプレビューのみ）。契約書の署名依頼・締結完了通知、請求書、代理店の支払明細をお客様へ実際に届けるには、**SMTP** か **Resend** のどちらかを設定します。

### A. Google Workspace の SMTP リレーで送る（推奨）

> ⚠️ **重要**: Google Workspace の SMTP リレー設定で「**SMTP 認証が必要**」を有効にしてください。
> 「送信元IPアドレスの制限」だけの運用では、**Vercel からは送信できません**（サーバーレスのため送信元IPが固定できず、許可リストに登録できないため）。
> 自社サーバーなど固定IPの環境から送る場合はIP制限のみでも動作します（その場合 `MAIL_USERNAME` は空のままで構いません）。

1. **Google 管理コンソール** → アプリ → Google Workspace → Gmail → **ルーティング** → 「SMTP リレー サービス」を追加
   - 送信者: 「ドメイン内のユーザーのみ」または「ドメイン外のアドレスも許可」
   - 認証: **「SMTP 認証が必要」にチェック**（IP制限と併用可）
   - 暗号化: 「TLS 暗号化が必要」にチェック
2. 送信に使うアカウント（例: `noreply@salonone.net`）で **2段階認証を有効にし、「アプリ パスワード」（16桁）を発行**します。
   通常のログインパスワードでは SMTP 認証は通りません。
3. Vercel の **Settings → Environment Variables** に設定する。

   | 変数 | 例 | 説明 |
   | --- | --- | --- |
   | `MAIL_HOST` | `smtp-relay.gmail.com` | 設定するだけで SMTP 送信モードになる |
   | `MAIL_PORT` | `587` | STARTTLS |
   | `MAIL_ENCRYPTION` | `tls` | `tls`(587) / `ssl`(465) / `none` |
   | `MAIL_USERNAME` | `noreply@salonone.net` | 空にすると SMTP 認証なし（IP許可のリレー向け） |
   | `MAIL_PASSWORD` | （アプリ パスワード16桁） | 通常のパスワードは不可 |
   | `MAIL_FROM_ADDRESS` | `noreply@salonone.net` | 送信元アドレス |
   | `MAIL_FROM_NAME` | `SalonOne` | 送信者の表示名（任意） |
   | `NEXT_PUBLIC_APP_URL` | `https://example.vercel.app` | メール内リンク（署名URL等）の基準 |

4. **再デプロイ** → アプリの **設定 → メール送信** で「送信モード: 実送信」を確認し、**テスト送信**で到達を確認します。

**届きやすさ（SPF / DKIM）**: 送信ドメインの SPF に `include:_spf.google.com` が含まれ、Google Workspace の DKIM（`google._domainkey`）が有効なら追加設定は不要です。

### B. Resend（API）で送る

1. [Resend](https://resend.com) で送信ドメインを追加し、表示された DNS レコード（DKIM / SPF）を登録して認証する。
2. API キーを発行し、Vercel に `RESEND_API_KEY` と `EMAIL_FROM`（認証したドメインのアドレス）を設定して再デプロイ。

> プレビュー（未送信）に戻したいときは `EMAIL_PROVIDER=console` を設定します。設定値を消さずに一時停止できます。

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
| 役割を兼務させられない / ゴミ箱でエラーになる | `0014_roles_and_soft_delete.sql` が未適用。SQL Editor で実行してください。 |
| 開発依頼の希望日が保存されない / 並び替えできない | `0015_dev_issue_desired_date_order.sql` が未適用。SQL Editor で実行してください。 |
| 保存・作成後に「ページが見つかりません」になる / 保存時に `SUPABASE_SERVICE_ROLE_KEY が未設定…` と表示される | `SUPABASE_SERVICE_ROLE_KEY` が未設定。Vercel の環境変数に service_role キーを設定し、再デプロイ。 |
| 「デモモード」と表示される | `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` が未設定。 |
| Cron が動かない | `CRON_SECRET` 未設定、または Vercel の Cron 権限を確認。 |
| メールが届かない | 「設定 → メール送信」で状態を確認。既定は未送信（プレビュー）です（→ [5. メールを実際に送る設定](#5-メールを実際に送る設定)）。 |
| テスト送信で「送信が拒否されました（5.7.1）」と出る | Google の SMTP リレーが送信元IPで弾いています。リレー設定で「**SMTP 認証が必要**」を有効にし、`MAIL_USERNAME` / `MAIL_PASSWORD` を設定してください。 |
| テスト送信で「認証に失敗しました（5.7.8）」と出る | `MAIL_PASSWORD` に通常のパスワードを入れていませんか。Google の**アプリ パスワード（16桁）**が必要です。 |
| テスト送信で「ドメインが認証済みか確認してください」と出る | （Resend 利用時）`EMAIL_FROM` のドメインが未認証。Resend の Domains で DNS 認証を完了させる。 |
| メール内のリンクが `localhost` などになる | `NEXT_PUBLIC_APP_URL` に公開URLを設定して再デプロイ。 |
