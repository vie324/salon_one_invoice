import {
  AlertTriangle,
  ArrowRightLeft,
  Banknote,
  CalendarClock,
  FileSignature,
  Landmark,
  LifeBuoy,
  Repeat,
  Rocket,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata = { title: "ヘルプ（業務フロー）" };

// 一覧はデータ依存のため常にサーバーで描画する(静的化するとビルド時データが焼き込まれる)
export const dynamic = "force-dynamic";

/**
 * 業務フローのヘルプページ。
 * 旧SATTOU運用（スプレッドシート・チャット中心）を本ツールに置き換えた
 * 「契約 → 納品 → 口座振替登録 → 毎月の請求・引き落とし」の標準手順をまとめる。
 */
export default function HelpPage() {
  return (
    <div>
      <PageHeader
        title="ヘルプ — 契約から引き落としまでの業務フロー"
        description="面談・成約から、電子契約の締結、システム納品、口座振替の登録、毎月の請求・引き落としまでの標準手順です。"
      />

      <div className="space-y-6">
        {/* 全体像 */}
        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <LifeBuoy className="h-5 w-5 text-primary" />
            <CardTitle>全体の流れ</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {[
                { n: 1, t: "契約〜納品", d: "顧客登録 → 電子契約の締結 → システム納品" },
                { n: 2, t: "口座振替の登録", d: "口座振替用紙の回収 → 収納代行(NSS)へ登録" },
                { n: 3, t: "毎月の請求", d: "請求書の自動生成・送付 → 確認期間(約1週間)" },
                { n: 4, t: "引き落とし・入金確認", d: "引き落としデータ登録 → 結果の消込" },
              ].map((s) => (
                <li key={s.n} className="rounded-md border border-border p-3">
                  <div className="flex items-center gap-2 font-semibold">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                      {s.n}
                    </span>
                    {s.t}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">{s.d}</p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        {/* 1. 契約〜納品 */}
        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <FileSignature className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>1. 契約からシステム納品まで</CardTitle>
              <CardDescription>面談を実施し、成約に至った場合の基本フロー</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Steps
              steps={[
                {
                  title: "顧客の登録",
                  body: (
                    <>
                      <StepLink href="/customers">顧客</StepLink> の「新規顧客」から、店舗名・担当者・メールアドレス・住所・支払方法（原則は口座振替）を登録します。
                      初期入力シートで回収した情報をここに反映します。
                    </>
                  ),
                },
                {
                  title: "契約書（申込書）の作成",
                  body: (
                    <>
                      <StepLink href="/contracts/new">契約書 → 新規作成</StepLink> で標準テンプレートを選び、プラン・オプション・店舗数を設定します。
                      「プランから料金表を生成」で契約書の料金表（別表）が自動作成されます。顧客ごとの特別条件は条文・料金表を直接編集してください。
                    </>
                  ),
                },
                {
                  title: "電子契約の締結",
                  body: (
                    <>
                      契約書詳細の「署名依頼を送付」で契約者へ署名リンクをメール送付します。
                      <strong>アクセスコードは画面に表示されるので、メールとは別経路（電話等）で契約者へ伝えてください</strong>（本人確認の2要素）。
                      契約者がリンクから内容を確認し、同意チェック＋氏名記入で締結完了。証跡と締結証明書は自動保存されます。
                      紙で締結した場合は「書面締結を登録」を使います（原本は本部保管）。
                      メールが実際に届く設定になっているかは <StepLink href="/settings">設定 → メール送信</StepLink> で確認できます（テスト送信も可能）。
                      <strong>メールを使わずに進めることもできます</strong>。署名依頼で「リンクを発行して自分で渡す」を選ぶと、
                      メールは送らずに署名リンクとQRコードを表示するので、LINE・SMS・対面（お客様のスマホで読み取り）でお渡しできます。
                      申込URLも同様に、コピー／QRコードでお渡しできます。
                    </>
                  ),
                },
                {
                  title: "システム開発・初期設定",
                  body: (
                    <>
                      システム担当者へ開発を依頼し、初期入力シートと照合しながらクライアント専用システムの初期設定・データ入力を行います（従来どおりの手順）。
                    </>
                  ),
                },
                {
                  title: "納品と請求の開始",
                  body: (
                    <>
                      納品のお知らせを送付し、クライアント側でシフト設定等を実施してもらいます。
                      締結済み契約書の <strong>「請求を開始」</strong> を押すと、定期契約（毎月の請求書自動生成）と初期費用の請求書（銀行振込）が自動作成されます。
                    </>
                  ),
                },
              ]}
            />
          </CardContent>
        </Card>

        {/* 2. 口座振替の登録 */}
        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>2. 口座振替の登録フロー</CardTitle>
              <CardDescription>入金方法を「口座振替」とする場合の登録手続き</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Steps
              steps={[
                {
                  title: "住所情報の確認",
                  body: (
                    <>
                      郵送先住所は顧客登録時に入力済みです（<StepLink href="/customers">顧客</StepLink> 詳細で確認・修正できます）。
                    </>
                  ),
                },
                {
                  title: "口座振替用紙の郵送・回収",
                  body: (
                    <>
                      登録住所宛に「口座振替用紙」を郵送し、記入のうえ本部へ返送してもらいます。
                      <strong>返送された用紙の原本は本部で保管します</strong>（紛失時は本部へ確認）。
                    </>
                  ),
                },
                {
                  title: "収納代行（NSS）への登録",
                  body: (
                    <>
                      本部から NSS システム側へ口座振替用紙を郵送し、「NSSシステム（収納サイト）」で口座情報を登録します。
                      口座番号等は自動で取り込まれるため、主に<strong>名義人などの情報を手動入力</strong>します。
                    </>
                  ),
                },
                {
                  title: "本ツールへの登録",
                  body: (
                    <>
                      顧客詳細の「口座振替」カードから <strong>「口座振替を登録」</strong> で口座情報を登録し、
                      NSS側の登録が完了したらステータスを <Badge tone="success">有効</Badge> にします。
                      「有効」の顧客のみ引き落としバッチの対象になります。
                    </>
                  ),
                },
                {
                  title: "口座振替の開始",
                  body: <>登録が完了した月より、口座振替による引き落としが開始されます。</>,
                },
              ]}
            />
          </CardContent>
        </Card>

        {/* 3. 毎月の請求・引き落とし */}
        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <Repeat className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>3. 毎月の請求・口座振替の実行フロー</CardTitle>
              <CardDescription>請求金額の確定から引き落としデータ登録・入金確認まで</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Steps
              steps={[
                {
                  title: "請求書の自動生成・自動送付",
                  body: (
                    <>
                      <StepLink href="/subscriptions">定期請求</StepLink> の内容（システム利用費・オプション）から、毎月の請求書が自動で生成・メール送付されます。
                      広告運用代行費などの変動費は <StepLink href="/invoices/new">請求書 → 新規作成</StepLink> で明細を追加するか、請求書を編集して同月分にまとめます。
                    </>
                  ),
                },
                {
                  title: "確認期間の確保（約1週間）",
                  body: (
                    <>
                      クライアントに請求内容を確認してもらうため、<strong>引き落としデータ登録までに1週間程度の確認期間を必ず設けます</strong>。
                      修正連絡があった場合は該当請求書の金額を訂正してから次の手順へ進みます。
                    </>
                  ),
                },
                {
                  title: "引き落としバッチの作成とCSV出力",
                  body: (
                    <>
                      確認期間内に相違がなければ、<StepLink href="/direct-debit">口座振替</StepLink> で「バッチを作成」し、入金待ちの振替請求をまとめます。
                      <strong>収納代行向けCSVを出力</strong>し、「NSSシステム（収納リンク）」へ確定金額を登録して手続きを完了します。
                    </>
                  ),
                },
                {
                  title: "引き落とし結果の反映・入金確認",
                  body: (
                    <>
                      引き落とし結果をバッチに反映すると、成功分は入金済みに、失敗分は「引落失敗」として要フォローになります。
                      銀行振込分は <StepLink href="/payments">入金確認</StepLink> で銀行明細CSVの取込・消し込みを行います。
                    </>
                  ),
                },
              ]}
            />
          </CardContent>
        </Card>

        {/* 4. 締め日 */}
        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            <CardTitle>4. 入金方法別の締め日</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>入金方法</TH>
                  <TH>入金タイミング</TH>
                </TR>
              </THead>
              <TBody>
                <TR>
                  <TD className="font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <Landmark className="h-4 w-4 text-muted-foreground" /> 口座振替
                    </span>
                  </TD>
                  <TD>
                    毎月決まった日に自動引き落とし。引き落とし日は NSS システムの記載（バッチの引き落とし予定日）を参照。
                  </TD>
                </TR>
                <TR>
                  <TD className="font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <Banknote className="h-4 w-4 text-muted-foreground" /> 銀行振込
                    </span>
                  </TD>
                  <TD>毎月25日までにクライアントより振込。</TD>
                </TR>
              </TBody>
            </Table>
          </CardContent>
        </Card>

        {/* 5. 旧運用との対応表 */}
        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>5. 旧運用（SATTOU）からの置き換え対応表</CardTitle>
              <CardDescription>これまでのツール・シートが本ツールのどの機能に対応するか</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>旧ツール / シート</TH>
                  <TH>用途</TH>
                  <TH>本ツールでの対応</TH>
                </TR>
              </THead>
              <TBody>
                <TR>
                  <TD className="font-medium">初期入力シート</TD>
                  <TD>初期登録情報の回収</TD>
                  <TD>
                    回収は従来どおりチャット等で実施し、内容を{" "}
                    <StepLink href="/customers">顧客</StepLink> に登録
                  </TD>
                </TR>
                <TR>
                  <TD className="font-medium">紙の契約書・申込書</TD>
                  <TD>契約締結</TD>
                  <TD>
                    <StepLink href="/contracts">契約書</StepLink>
                    （テンプレート編集・電子署名・締結証明書・証跡管理）
                  </TD>
                </TR>
                <TR>
                  <TD className="font-medium">入力用スプレッドシート（住所回収）</TD>
                  <TD>郵送先住所の回収</TD>
                  <TD>顧客登録時の住所欄に一本化</TD>
                </TR>
                <TR>
                  <TD className="font-medium">入力用スプレッドシート（請求金額）</TD>
                  <TD>毎月の請求金額の入力・送付</TD>
                  <TD>
                    <StepLink href="/invoices">請求書</StepLink>（定期分は自動生成・自動送付、変動費は明細追加）
                  </TD>
                </TR>
                <TR>
                  <TD className="font-medium">NSSシステム（収納サイト）</TD>
                  <TD>口座情報の登録</TD>
                  <TD>
                    従来どおりNSSへ登録し、完了後に顧客詳細の「口座振替」を{" "}
                    <Badge tone="success">有効</Badge> にする
                  </TD>
                </TR>
                <TR>
                  <TD className="font-medium">NSSシステム（収納リンク）</TD>
                  <TD>引き落としデータ登録・引き落とし日確認</TD>
                  <TD>
                    <StepLink href="/direct-debit">口座振替</StepLink> でバッチ作成 → CSV出力 → NSSへ登録 → 結果を反映
                  </TD>
                </TR>
              </TBody>
            </Table>
          </CardContent>
        </Card>

        {/* 6. 注意点 */}
        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <CardTitle>6. 引き継ぎ時の注意点</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
              <li>
                口座振替用紙・書面契約の<strong className="text-foreground">原本は本部保管</strong>です。紛失時は本部へ確認してください
                （電子契約の場合は本ツールに契約書・締結証明書が保存されます）。
              </li>
              <li>
                毎月の請求は<strong className="text-foreground">確認期間（約1週間）を必ず確保</strong>し、期間内に NSS
                システムへの引き落としデータ登録を完了させてください。
              </li>
              <li>
                確認期間中にクライアントから修正連絡があった場合は、
                <strong className="text-foreground">請求書の金額を訂正したうえで</strong>引き落としデータを登録してください。
              </li>
              <li>
                送付済みの契約書は内容を変更できません。条件変更が必要な場合は取消のうえ新しい契約書を作成してください。
              </li>
              <li>
                電子契約のアクセスコードはメールに記載されません。
                <strong className="text-foreground">必ず電話等の別経路で契約者本人に伝えてください</strong>。
              </li>
            </ul>
            <div className="mt-4 flex items-center gap-2 rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
              <Rocket className="h-4 w-4 shrink-0" />
              締結済みの契約書から「請求を開始」すると、定期契約・初期費用請求までここで説明した流れに自動で乗ります。
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Steps({ steps }: { steps: { title: string; body: React.ReactNode }[] }) {
  return (
    <ol className="space-y-4">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold text-primary">
            {i + 1}
          </span>
          <div className="min-w-0 text-sm">
            <div className="font-semibold">{s.title}</div>
            <p className="mt-0.5 leading-relaxed text-muted-foreground">{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function StepLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-primary hover:underline">
      {children}
    </Link>
  );
}
