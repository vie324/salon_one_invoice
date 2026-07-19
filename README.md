# SalonOne — One Platform. One Management.

サロン向けの **契約(申込書)・電子契約・請求書 作成・送付・管理** アプリケーション。
**Vercel + Supabase** で動くフルスタック構成。**口座振替（引き落とし）** と **Stripe（初期費用＋月額サブスク）** の両方に対応し、**入金確認機能**も備えます。担当者の日次オペレーションと、経営者の売上・入金俯瞰の両方に最適化した UI（ディープ・ティール × ゴールドのブランドカラー）です。

> **すぐ試せます。** Supabase を設定しなくても、`npm install && npm run dev` で **デモモード**が起動します。
> 業務データは空の状態から始まります（自社情報・料金プラン・契約書テンプレートのみ初期投入。デモモードのデータはインメモリのため再起動でリセットされます）。

---

## 主な機能

| 領域 | 内容 |
| --- | --- |
| **ダッシュボード** | ロール対応（経営者＝売上・入金・MRR の俯瞰／担当者＝要対応タスク）。売上・入金推移グラフ、入金内訳、最近の動き。 |
| **契約書 / 電子契約** | 契約書テンプレート管理（標準の利用契約書・全23条を同梱）、顧客ごとの料金・条文編集、**電子署名（署名依頼メール＋アクセスコード）**、締結証跡（監査ログ）、**締結証明書のPDF出力**、締結後の請求自動連携（定期契約＋初期費用請求）。紙で締結した場合の手動登録にも対応。 |
| **請求書** | 作成（明細・税率別集計・インボイス対応）、下書き／送付、ステータス管理（下書き・送付済・入金待ち・一部入金・入金済・期限超過・引落失敗・取消）、メール送付、**自動送付（Cron）**、**印刷 / PDF**。 |
| **定期請求（サブスク）** | 月額プラン定義・加入管理、**毎月の請求書を自動生成＋メール自動送付**（Vercel Cron 対応）、MRR 集計。 |
| **口座振替（引き落とし）** | 入金待ちの振替請求をバッチ化、**収納代行向け CSV 出力**、引き落とし処理（成功＝入金確認／失敗＝要フォロー）。 |
| **入金確認** | 手動入金記録・消し込み、**銀行明細 CSV の取込と自動照合**（金額・名義）、初期費用など単発入金の確認。 |
| **顧客 / 会員** | 顧客管理、口座振替（マンデート）の登録・状況管理、契約・請求・入金履歴。 |
| **ヘルプ** | 契約 → 納品 → 口座振替登録 → 毎月の請求・引き落としの標準業務フロー（旧SATTOU運用からの置き換え対応表つき）。 |

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
   # 初期データ（自社情報・料金プランのみ。テストデータは含まない）
   psql "$SUPABASE_DB_URL" -f supabase/seed.sql
   # 既存DBのテストデータを空にする場合（取り消し不可・実行前に要確認）
   psql "$SUPABASE_DB_URL" -f supabase/cleanup_test_data.sql
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

## Stripe で初期費用＋月額を管理する

高額の初期費用（例: 100,000円・単発）と月額（例: 5,000〜30,000円・継続）を **Stripe Checkout 1 回でまとめて登録**し、以降は自動で月額課金します（初期費用は初回請求書に加算）。顧客詳細ページの **「Stripeで課金開始」** から実行します。

### すぐ試す（Stripe キー不要）
「Stripeで課金開始」ダイアログの **「テスト決済をシミュレート」** で、初期費用＋初月の決済成功を再現し、定期契約・請求・入金の管理フローを即座に確認できます（価格帯の検証用）。

### 本番/テストモードの Stripe を接続する
1. `.env.local` を設定:
   ```env
   PAYMENT_PROVIDER=stripe
   STRIPE_SECRET_KEY=sk_test_xxx          # Stripe テストキー
   STRIPE_WEBHOOK_SECRET=whsec_xxx        # 下記 stripe listen が発行
   ```
2. ローカルで Webhook を受ける（[Stripe CLI](https://docs.stripe.com/stripe-cli)）:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   # 表示された whsec_... を STRIPE_WEBHOOK_SECRET に設定
   ```
3. `npm run dev` → 顧客詳細で「Stripeで課金開始」→ **Stripe Checkout へ進む** →
   テストカード `4242 4242 4242 4242`（有効期限は未来、CVC任意）で決済。
4. Webhook（`checkout.session.completed` / `invoice.paid` ほか）がアプリに同期し、
   初期費用＋初月の入金・定期契約・ダッシュボードが更新されます。

> 本番 Vercel では、Stripe ダッシュボードで Webhook エンドポイント
> `https://<your-app>/api/stripe/webhook` を登録し、その署名シークレットを
> `STRIPE_WEBHOOK_SECRET` に設定してください。

## 契約書・電子契約

「契約書」メニューから、申込書・契約書の **作成 → 編集 → 電子署名依頼 → 締結 → 請求開始** までを一気通貫で行えます。

### フロー

1. **テンプレートから作成** — 標準の「SalonOne サービス利用契約書（全23条）」テンプレートを同梱。契約作成時に内容がコピーされるため、顧客ごとに料金表・条文を自由に編集できます（テンプレート変更は既存契約に影響しません）。
2. **プラン連携** — プランを選ぶと申込条件（初期費用・月額・オプション・店舗数）が自動反映され、「プランから料金表を生成」で契約書の別表を自動作成できます。
3. **署名依頼の送付** — 契約者のメールアドレスへ専用リンクを送付。**送付時に契約内容の SHA-256 ハッシュを固定化**し、以降の内容変更は DB トリガーでも拒否されます。
4. **契約者の署名** — 契約者はリンクから内容を確認し、氏名の記入＋同意チェックで電子署名。締結証跡（閲覧・同意の日時、IPアドレス、端末情報）が記録され、双方に締結完了メールが届きます。
5. **締結後** — 「請求を開始」ボタンで定期契約と初期費用請求書を自動作成。締結証明書付きのPDF出力が可能です。

### 電子署名の法的リスク低減のための設計

本機能は **事業者署名型（立会人型）電子署名** の考え方に基づき、以下を実装しています。

- **本人性の担保（2要素）**: 契約者本人のメールアドレス宛の専用リンク（暗号乱数トークン・有効期限付き）に加えて、**6桁アクセスコード**（メールに記載せず、電話等の別経路で伝達）を推奨設定。誤入力の試行回数制限つき。
- **非改変性の担保**: 送付時に契約内容の正規化 JSON を SHA-256 でハッシュ化して固定。**署名時にハッシュを再計算・照合**し、送付後の内容変更は DB トリガー（`contracts_freeze_content`）でサービスロールを含む全経路で拒否。
- **証跡の保全**: 作成・送付・閲覧・コード検証・署名・辞退・取消の全イベントを **追記専用の監査ログ**（UPDATE/DELETE を DB トリガーで禁止）に IP・UA・時刻付きで記録。締結証明書として書面化・PDF保存可能。
- **電子帳簿保存法への配慮**: 締結済み契約は削除不可（取消は状態として記録）、契約一覧は取引先・日付・金額で検索可能。訂正削除の防止措置を DB レベルで実装。

> **注意（法務向け）**: 本実装はいわゆる認定タイムスタンプ（TSA）や当事者型電子証明書は使用しません。多くの SaaS 利用契約はこの方式（立会人型）で実務上広く運用されていますが、
> 訴訟リスクの高い高額契約等では、締結証明書PDFの長期保管、アクセスコードの別経路伝達の徹底、必要に応じた外部電子契約サービスの併用をご検討ください。
> 運用ルール（誰が送付できるか、コードの伝達方法等）を社内規程として定めることを推奨します。

### 紙の契約書にも対応

書面で締結した場合は「書面締結を登録」から締結記録（署名者・締結日・原本保管場所）を登録でき、電子・紙どちらの締結経路でも契約管理を一元化できます。

## 定期請求の自動生成・自動送付（Cron）

`/api/cron/generate-invoices` が、`next_billing_date` が到来した稼働中の定期契約から請求書を生成します（`billing_period` 単位で二重生成を防止）。生成した請求書は、顧客にメールアドレスが登録されていれば**自動でメール送付**されます（`INVOICE_AUTO_EMAIL=false` で無効化）。

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
