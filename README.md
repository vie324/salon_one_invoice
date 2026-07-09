# salon_one_invoice

サロン向けの **請求書 作成・送付・管理** アプリケーション。
**Vercel + Supabase** で動くフルスタック構成。**口座振替（引き落とし）を軸に、入金確認機能**も備えます。担当者の日次オペレーションと、経営者の売上・入金俯瞰の両方に最適化した UI です。

> **すぐ試せます。** Supabase を設定しなくても、`npm install && npm run dev` で **デモモード**（サンプルデータ入り）が起動します。

---

## 主な機能

| 領域 | 内容 |
| --- | --- |
| **ダッシュボード** | ロール対応（経営者＝売上・入金・MRR の俯瞰／担当者＝要対応タスク）。売上・入金推移グラフ、入金内訳、最近の動き。 |
| **請求書** | 作成（明細・税率別集計・インボイス対応）、下書き／送付、ステータス管理（下書き・送付済・入金待ち・一部入金・入金済・期限超過・引落失敗・取消）、メール送付、**印刷 / PDF**。 |
| **定期請求（サブスク）** | 月額プラン定義・加入管理、**毎月の請求書を自動生成**（Vercel Cron 対応）、MRR 集計。 |
| **口座振替（引き落とし）** | 入金待ちの振替請求をバッチ化、**収納代行向け CSV 出力**、引き落とし処理（成功＝入金確認／失敗＝要フォロー）。 |
| **入金確認** | 手動入金記録・消し込み、**銀行明細 CSV の取込と自動照合**（金額・名義）、初期費用など単発入金の確認。 |
| **顧客 / 会員** | 顧客管理、口座振替の登録状況、契約・請求・入金履歴。 |

## 決済方針（引き落とし × 入金確認）

「原則 引き落とし」にしつつ、初期費用の振込入金なども確認できるよう、**決済プロバイダ非依存**の設計にしています。

- **既定（`manual`）**: 自動与信は行わず、口座振替バッチ ＋ 手動入金確認 ＋ 銀行明細 CSV 照合で消し込みます。日本の口座振替（GMO・SMBC 等の収納代行）にも、CSV 出力＋取込で対応できます。
- **`stripe`**: `PAYMENT_PROVIDER=stripe` と `STRIPE_SECRET_KEY` を設定すると Stripe 参考アダプタが有効になります。
- 独自の収納代行 API を使う場合は、`src/lib/payments/provider.ts` の `PaymentProvider` を実装したアダプタを追加し、`src/lib/payments/index.ts` の分岐に足すだけです。

---

## 技術スタック

- **Next.js 15**（App Router / Server Components / Server Actions）+ **TypeScript**
- **Tailwind CSS v4**（ライト／ダーク対応、検証済みのアクセシブルなグラフ配色）
- **Supabase**（PostgreSQL / Auth / RLS）
- 外部 SDK に依存しないメール（Resend）・決済（Stripe）アダプタ（REST 直叩き）
- グラフは依存ライブラリ無しの自作 SVG（軽量・デザイン統一）

---

## クイックスタート（デモモード）

```bash
npm install
npm run dev
# http://localhost:3000 を開く（サンプルデータで全機能が動作）
```

デモモードは Supabase 未設定時に自動で有効化され、インメモリのサンプルデータで動作します（データはプロセス内のみ・再起動でリセット）。右上のトグルで「経営者表示／担当者表示」を切り替えられます。

## 本番セットアップ（Supabase 連携）

1. [Supabase](https://supabase.com) でプロジェクトを作成。
2. `supabase/migrations/*.sql` を順に実行（SQL Editor もしくは Supabase CLI）。
   ```bash
   # Supabase CLI の例
   supabase link --project-ref <your-ref>
   supabase db push        # migrations を適用
   # 初期データ（任意）
   psql "$SUPABASE_DB_URL" -f supabase/seed.sql
   ```
3. `.env.example` を `.env.local` にコピーし、値を設定。
   ```bash
   cp .env.example .env.local
   ```
   最低限:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...   # cron/webhook 用（サーバー専用）
   ```
4. ユーザーを Supabase Auth で作成。サインアップ時に `profiles` が自動作成されます（`role` 既定は `staff`。`owner`/`admin` は `profiles.role` を更新）。
5. `npm run dev`（または `npm run build && npm start`）。

環境変数の全項目は [`.env.example`](.env.example) を参照してください。

---

## 定期請求の自動生成（Cron）

`/api/cron/generate-invoices` が、`next_billing_date` が到来した稼働中の定期契約から請求書を生成します（`billing_period` 単位で二重生成を防止）。

- **Vercel Cron**: [`vercel.json`](vercel.json) に日次スケジュールを定義済み。Vercel が `Authorization` を自動付与します。
- 手動実行:
  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>/api/cron/generate-invoices
  ```
- アプリの「定期請求」画面の **「定期請求を今すぐ生成」** ボタンからも実行できます。

---

## メール送付

- 既定（`console`）: 実送信せずプレビュー（サーバーログ出力）。
- `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` + `EMAIL_FROM` で [Resend](https://resend.com) による実送信。

---

## プロジェクト構成

```
src/
├─ app/
│  ├─ (app)/                 認証後のアプリ本体（ダッシュボード/請求書/顧客/定期/口座振替/入金/設定）
│  ├─ actions/               Server Actions（請求書・入金・口座振替・顧客・定期・認証）
│  ├─ api/                   Cron・口座振替CSV などの Route Handler
│  ├─ login/ , print/        ログイン / 印刷用（PDF）
├─ components/               UIキット・アプリシェル・グラフ・請求書ドキュメント
├─ lib/
│  ├─ data/                  リポジトリ抽象（demo=インメモリ / supabase=本番）
│  ├─ domain/                型・計算（税/合計/番号採番）・指標・定数
│  ├─ payments/ email/ bank/ 決済・メール・銀行CSVの各アダプタ
│  ├─ supabase/              Supabase クライアント（ブラウザ/サーバー/管理者/middleware）
supabase/
├─ migrations/               スキーマ・RLS・関数
└─ seed.sql                  初期データ
```

### データアクセスの抽象化

すべての画面・アクションは [`getRepository()`](src/lib/data/index.ts) を介してデータへアクセスします。`Repository` インターフェイス（[`src/lib/data/repository.ts`](src/lib/data/repository.ts)）を、**デモ（インメモリ）** と **Supabase** の 2 実装が満たします。ダッシュボード指標などのロジックは [`src/lib/domain/metrics.ts`](src/lib/domain/metrics.ts) に集約し、両実装で共有しています。

---

## ロール

| ロール | 用途 |
| --- | --- |
| `owner`（経営者） | 売上・入金・MRR の俯瞰。 |
| `staff`（担当者） | 日々の請求・入金・フォロー業務。 |
| `admin`（管理者） | 全機能。 |

## スクリプト

```bash
npm run dev        # 開発サーバー
npm run build      # 本番ビルド（型チェック込み）
npm start          # 本番起動
npm run typecheck  # 型チェックのみ
```

デプロイ手順は [DEPLOYMENT.md](DEPLOYMENT.md) を参照してください。
