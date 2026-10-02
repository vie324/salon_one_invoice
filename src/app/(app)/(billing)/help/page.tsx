import {
  AlertTriangle,
  ArrowRightLeft,
  CalendarClock,
  ClipboardCheck,
  FileSignature,
  Gift,
  Handshake,
  History,
  Landmark,
  LifeBuoy,
  ListChecks,
  Repeat,
  Rocket,
  Users,
} from "lucide-react";
import Link from "next/link";
import { DealTypeBadge, FlowStepper } from "@/components/orders/order-ui";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { agencyCommissionAmount, agencyRateLabel } from "@/lib/domain/agency";
import {
  AGENCY_DEAL_TYPE_KEYS,
  AGENCY_DEAL_TYPES,
  NSS_CONFIRMATION_DAYS,
  REFERRAL_FREE_MONTHS,
  REFERRAL_REWARD_RATE,
} from "@/lib/domain/constants";
import { formatJPY } from "@/lib/utils";

export const metadata = { title: "ヘルプ（業務フロー）" };

// 一覧はデータ依存のため常にサーバーで描画する(静的化するとビルド時データが焼き込まれる)
export const dynamic = "force-dynamic";

/** 代理店報酬の計算例に使う初期費用(税抜) */
const EXAMPLE_INITIAL_FEE = 100_000;

const TOC = [
  { id: "flow", label: "全体の流れ" },
  { id: "roles", label: "誰が・どの画面で・何をするか" },
  { id: "apply", label: "① 申込・契約" },
  { id: "review", label: "② 受注確認" },
  { id: "setup", label: "③ 導入準備" },
  { id: "monthly", label: "④ 毎月の請求・NSS引き落とし" },
  { id: "past", label: "過去のお客様（契約書が無い・旧画面で管理）" },
  { id: "agency", label: "代理店" },
  { id: "referral", label: "紹介制度" },
  { id: "nss", label: "NSS とこのツールの役割分担" },
  { id: "omissions", label: "よくある抜け漏れと防ぎ方" },
  { id: "legacy", label: "旧運用・旧画面からの置き換え" },
  { id: "notes", label: "引き継ぎ時の注意点" },
];

/**
 * 業務フローのヘルプページ。
 * 「申込・契約 → 受注確認 → 導入準備 → 運用中」と、毎月の請求・NSS引き落としの
 * 標準手順をまとめる。画面の名前・ボタンの名前はアプリの表記にそろえる。
 */
export default function HelpPage() {
  return (
    <div>
      <PageHeader
        title="ヘルプ — 申込から受注・運用開始までの業務フロー"
        description="申込と契約は1本のURLになりました。お客様の申込・電子署名 → 請求管理者の受注確認 → 導入準備 → 運用開始、そして毎月の請求・NSS引き落としまでの標準手順です。"
      />

      <div className="space-y-6">
        {/* 目次 */}
        <Card>
          <CardContent className="pt-4 sm:pt-5">
            <div className="mb-2 text-xs font-semibold text-muted-foreground">このページの内容</div>
            <ol className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {TOC.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="text-primary hover:underline">
                    {t.label}
                  </a>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        {/* 全体の流れ */}
        <Section id="flow" icon={LifeBuoy} title="全体の流れ" description="案件（お客様1件）は左から右へ進みます。ステージは実データから自動で進むので、カードを動かす作業はありません。">
          <FlowStepper />
          <div className="mt-3 flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
            <Repeat className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <span className="font-semibold">運用中は毎月:</span> 1日に請求書の自動作成・送付 → 確認期間（約{NSS_CONFIRMATION_DAYS}日） → NSS
              へ金額を登録 → 27日に引き落とし → 結果を反映（入金済／要フォロー）
            </div>
          </div>
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-muted-foreground">
            <li>
              いま何をすべきかは <StepLink href="/orders">受注管理</StepLink> の「対応待ち」を上から片づければ分かります（ホームの「いま急ぐこと」にも出ます）。
            </li>
            <li>
              案件ごとの手続きは案件ページに「次にやること」とボタンが出ます。終わった手続きは自動で ✓ が付きます（入金・締結・NSS 登録などは実データから判定）。
            </li>
          </ul>
        </Section>

        {/* 役割分担 */}
        <Section id="roles" icon={Users} title="誰が・どの画面で・何をするか" description="担当と、終わったときの目印です。">
          <Table>
            <THead>
              <TR>
                <TH>手順</TH>
                <TH>担当</TH>
                <TH>使う画面・ボタン</TH>
                <TH>終わった目印</TH>
              </TR>
            </THead>
            <TBody>
              <RoleRow step="① 申込・契約URLを発行して渡す" who="営業（請求管理者）／代理店" where={<><StepLink href="/applications">申込・契約URL</StepLink>・<StepLink href="/agencies">代理店</StepLink>・<StepLink href="/referrals">紹介・問い合わせ</StepLink> の「申込・契約URLを発行」</>} done="URL・QR・案内文を渡した" />
              <RoleRow step="① 申込内容の入力・電子署名" who="お客様" where="お客様のスマホ・PC（URLを開くだけ）" done="受注管理に「受注確認」で並ぶ" />
              <RoleRow step="② 内容の確認・受注確定" who="請求管理者" where={<><StepLink href="/orders">受注管理</StepLink> → 案件ページ「受注を確定する」</>} done="初回請求書と毎月の請求ができる" />
              <RoleRow step="② 過去のお客様の請求を開始" who="請求管理者" where="案件ページ「書面・旧運用で締結済み」→「請求を開始」" done="初回請求書・毎月の請求が設定される" />
              <RoleRow step="③ 初回請求書の送付" who="請求管理者" where="案件ページ「メールで送付」（郵送・手渡しなら「完了にする」）" done="✓ 初回請求書をお客様へ送付（入金を確認すると自動で ✓）" />
              <RoleRow step="③ 初回の入金確認" who="請求管理者" where={<><StepLink href="/payments">入金確認</StepLink>（銀行明細CSVの取込・消込）</>} done="初回請求書が「入金済」" />
              <RoleRow step="③ 口座振替依頼書の郵送" who="請求管理者" where="案件ページ「郵送した」" done="✓ 郵送日" />
              <RoleRow step="③ 依頼書の回収" who="お客様が返送 → 請求管理者" where="案件ページ「回収した」" done="✓ 回収日（原本は本部保管）" />
              <RoleRow step="③ NSS への登録" who="請求管理者" where="NSS 収納サイト ＋ 案件ページ「NSSへ登録した」" done="✓ 登録日" />
              <RoleRow step="③ NSS 登録完了の確認" who="NSS → 請求管理者" where="案件ページ「登録完了（振替開始月を記録）」" done="NSS登録済・振替開始月" />
              <RoleRow step="③ 初期設定・納品" who="導入担当（営業・初期設定型の代理店案件は代理店）" where="案件ページ「完了にする」" done="✓ 初期設定・納品のご案内" />
              <RoleRow step="④ 毎月の請求書" who="システム（自動）" where={<StepLink href="/subscriptions">定期請求</StepLink>} done="毎月1日にその月の請求書が作成・送付される" />
              <RoleRow step="④ NSS へ金額を登録" who="請求管理者" where={<><StepLink href="/direct-debit">NSS引き落とし</StepLink>「NSS登録用の一覧を作る」→ CSV → 「NSSへ登録した」</>} done="一覧が「NSS登録済」" />
              <RoleRow step="④ 引き落とし結果の反映" who="請求管理者" where="NSS引き落とし の一覧「結果を反映する」" done="入金済／引落失敗（要フォロー）" />
              <RoleRow step="毎月 代理店報酬の支払い" who="請求管理者" where={<><StepLink href="/agencies">代理店</StepLink>「支払済みにする」・明細のメール／印刷</>} done="報酬が「支払済」" />
            </TBody>
          </Table>
        </Section>

        {/* ① 申込・契約 */}
        <Section id="apply" icon={FileSignature} title="① 申込・契約（申込と契約が1本になりました）" description="お客様は1本のURLで、申込内容の入力から契約内容の確認・電子署名まで完了します。契約書を別に作って送る手間と、送り忘れがなくなります。">
          <h3 className="mb-2 text-sm font-semibold">URLの種類</h3>
          <Table>
            <THead>
              <TR>
                <TH>種類</TH>
                <TH>使う場面</TH>
                <TH>発行する画面</TH>
              </TR>
            </THead>
            <TBody>
              <TR>
                <TD className="whitespace-nowrap font-medium"><Badge tone="primary">申込＋契約</Badge></TD>
                <TD>お客様ごとに渡す標準のURL。プラン・店舗数・個別価格を決めて発行します。</TD>
                <TD><StepLink href="/orders">受注管理</StepLink>／<StepLink href="/applications">申込・契約URL</StepLink></TD>
              </TR>
              <TR>
                <TD className="whitespace-nowrap font-medium"><Badge tone="warning">代理店URL</Badge></TD>
                <TD>代理店がお客様に渡す常設のURL。「まずは相談したい」と「このまま申し込む」を選べます。何件でも受け付けます。</TD>
                <TD><StepLink href="/agencies">代理店</StepLink> の各代理店ページ</TD>
              </TR>
              <TR>
                <TD className="whitespace-nowrap font-medium"><Badge tone="info">紹介から</Badge></TD>
                <TD>紹介・問い合わせに連絡したあと、その方に送るURL。紹介者・代理店の紐付けと特典が自動で引き継がれます。</TD>
                <TD><StepLink href="/referrals">紹介・問い合わせ</StepLink> の各行</TD>
              </TR>
              <TR>
                <TD className="whitespace-nowrap font-medium"><Badge tone="neutral">申込のみ</Badge></TD>
                <TD>料金がまだ決まっていないときだけ。届いた申込は受注管理の対応待ちに出るので、「顧客として登録」→ 契約書を作って送ります。</TD>
                <TD><StepLink href="/applications">申込・契約URL</StepLink>（種類で「申込のみ」）</TD>
              </TR>
            </TBody>
          </Table>

          <h3 className="mb-2 mt-5 text-sm font-semibold">発行のしかた</h3>
          <Steps
            steps={[
              { title: "「申込・契約URLを発行」を押す", body: <>宛先メモ（例: ○○サロン様）、プラン、オプションの初期選択、店舗数（お客様が入力 or 指定）、必要なら個別価格（初期費用・月額基本料金）、代理店経由なら代理店・営業担当・区分を選びます。料金の見込みがその場で表示されます。</> },
              { title: "URLを渡す", body: <>「URLをコピー」「案内文ごとコピー」（LINE・メールにそのまま貼れる文面）、または QR コード（対面でお客様のスマホで読み取り）で渡します。メールの設定は不要です。</> },
            ]}
          />

          <h3 className="mb-2 mt-5 text-sm font-semibold">お客様の画面（4ステップ・約5分）</h3>
          <ol className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[
              { t: "お客様情報", d: "法人名（個人名）・登記住所・代表者・ご担当者・電話・メール" },
              { t: "プラン・料金", d: "オプションと店舗数を選ぶと、初期費用・月額（税込）とお支払いの流れが表示されます" },
              { t: "連携情報（任意）", d: "HPB・minimo・EPARK の ID/PASS（暗号化して保管）、LINE連携の希望" },
              { t: "契約の確認・署名", d: "入力内容と料金が反映された契約書を確認し、氏名を入力して同意" },
            ].map((s, i) => (
              <li key={s.t} className="rounded-md border border-border p-3">
                <div className="flex items-center gap-2 font-semibold">
                  <Num n={i + 1} />
                  {s.t}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">{s.d}</p>
              </li>
            ))}
          </ol>

          <h3 className="mb-2 mt-5 text-sm font-semibold">送信と同時に自動で行われること</h3>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            <li>申込・顧客・契約書（締結済み。閲覧・同意の日時、IP、端末、内容ハッシュの証跡つき）を作成</li>
            <li>受注管理に案件が「受注確認」として並ぶ（代理店・紹介の紐付けも自動）</li>
            <li>お客様へ受付完了メール（契約書の控えのリンクと「このあとの流れ」）、社内へ「受注確認待ち」の通知メール</li>
          </ul>
          <Callout>
            契約書第3条のとおり、契約は<strong>当社が承諾したとき（= 受注確定）</strong>に成立します。お客様の電子署名は「契約内容に同意したうえでの申込」です。
          </Callout>
          <p className="mt-3 text-sm text-muted-foreground">
            条文そのものを変える必要がある契約や、アクセスコードで本人確認を強めたい場合は、従来どおり <StepLink href="/contracts/new">契約書 → 新規作成</StepLink> で個別に作成して署名依頼を送れます（締結後は同じく受注管理で受注確定します）。
          </p>
        </Section>

        {/* ② 受注確認 */}
        <Section id="review" icon={ClipboardCheck} title="② 受注確認（請求管理者）" description="締結済みの申込を確認して「受注を確定する」を押します。ここが申込から請求への受け渡しです。">
          <h3 className="mb-2 text-sm font-semibold">確認するところ</h3>
          <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
            {[
              "会社名・登記住所・代表者（契約書の乙欄）",
              "連絡先（請求書の送付先メールアドレス）",
              "プラン・オプション・店舗数・金額（個別価格の妥当性）",
              "代理店・営業担当・区分（報酬が変わります）",
              "紹介者（紹介特典の対象か）",
              "同じお客様の二重申込がないか",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {t}
              </li>
            ))}
          </ul>
          <h3 className="mb-2 mt-5 text-sm font-semibold">「受注を確定する」でまとめて作られるもの</h3>
          <Steps
            steps={[
              { title: "初回請求書（銀行振込）", body: <>初期費用＋初月の日割り（利用開始日〜月末）。支払期限は発行から14日。確定画面で「そのままメールで送る」を選べます。</> },
              { title: "毎月の請求（定期契約）", body: <>翌月分から毎月の請求書が自動で作られます。<strong>店舗数・個別価格も契約書どおり</strong>に請求されます。</> },
              { title: "支払方法を口座振替（NSS）に", body: <>翌月以降は NSS で引き落とします。口座振替依頼書の手続きを進めてください。</> },
              { title: "紹介特典・代理店報酬の確定", body: <>紹介のお客様は初月日割り無料＋{REFERRAL_FREE_MONTHS}ヶ月無料、紹介者へ初期費用の{Math.round(REFERRAL_REWARD_RATE * 100)}%。代理店経由は初期費用×区分の率を報酬として計上します。</> },
            ]}
          />
          <p className="mt-3 text-sm text-muted-foreground">
            見送る場合は案件ページの「休止・見送りにする」を押し、理由を残します（再開もできます）。
          </p>
        </Section>

        {/* ③ 導入準備 */}
        <Section id="setup" icon={Rocket} title="③ 導入準備（3つを並行で進める）" description="受注確定のあと、次の3つを同時に進めます。すべて終わると自動で「運用中」になります。">
          <div className="grid gap-3 lg:grid-cols-3">
            <SubCard title="請求・入金" icon={CalendarClock}>
              <Steps
                steps={[
                  { title: "毎月の請求（定期契約）", body: <>受注確定で自動で登録されます。プランの無い契約や過去のお客様で定期契約が無いと「毎月の請求（定期契約）を登録」が対応待ちに残ります。</> },
                  { title: "初回請求書を送付", body: <>案件ページの「メールで送付」（受注確定の画面で「そのままメールで送る」を選んだ場合は送付済み）。郵送・手渡しの場合は「完了にする」。</> },
                  { title: "入金を確認", body: <><StepLink href="/payments">入金確認</StepLink> で銀行明細CSVを取り込み、消し込みます。期限を過ぎると「遅れ」として対応待ちに出るので、督促メールを送ります。</> },
                ]}
              />
            </SubCard>
            <SubCard title="口座振替（NSS）" icon={Landmark}>
              <Steps
                steps={[
                  { title: "依頼書を郵送", body: <>登録住所あてに口座振替依頼書を郵送 →「郵送した」（契約締結後すぐ送れます）。</> },
                  { title: "回収", body: <>返送されたら「回収した」。原本は本部で保管。<strong>郵送から14日</strong>を超えると「要確認」になります。</> },
                  { title: "NSS へ登録", body: <>依頼書を NSS へ送り、収納サイトで登録 →「NSSへ登録した」。不備の連絡があれば「不備あり」→ 再提出で「再提出した」。</> },
                  { title: "登録完了", body: <>NSS の登録完了を確認したら「登録完了（振替開始月を記録）」。それより前の月の請求は振込でお願いします。</> },
                ]}
              />
            </SubCard>
            <SubCard title="初期設定・導入" icon={Rocket}>
              <Steps
                steps={[
                  { title: "連携情報をそろえる", body: <>申込で受け取った ID/PASS は案件ページで「表示する」を押したときだけ見られます。足りなければお客様に確認。</> },
                  { title: "初期設定", body: <>初期入力シートと照合しながらクライアント専用環境を構築。<strong>営業・初期設定型の代理店案件は代理店が担当</strong>（完了の連絡を受けてチェック）。</> },
                  { title: "納品・利用開始のご案内", body: <>納品のお知らせを送り、シフト設定などをお客様に進めていただきます。</> },
                ]}
              />
            </SubCard>
          </div>
        </Section>

        {/* ④ 毎月 */}
        <Section id="monthly" icon={Repeat} title="④ 毎月の請求・NSS引き落とし" description="運用中のお客様の毎月の流れです。">
          <Steps
            steps={[
              { title: "請求書の自動作成・送付（毎月1日）", body: <><StepLink href="/subscriptions">定期請求</StepLink> から、その月の請求書（引き落とし日は27日）が毎月1日に自動で作られ、メールで送付されます（口座振替の請求は「入金待ち（引き落とし予定）」）。広告運用代行費などの変動費は <StepLink href="/invoices/new">請求書 → 新規作成</StepLink> で追加します。</> },
              { title: `確認期間（約${NSS_CONFIRMATION_DAYS}日）`, body: <>お客様に請求内容を確認していただく期間です。修正の連絡があれば請求書の金額を訂正してから次へ進みます（NSS引き落とし画面に「確認期間中」と表示されます）。</> },
              { title: "対象の確認", body: <><StepLink href="/direct-debit">NSS引き落とし</StepLink> で、その月に引き落とせる請求と、<strong>NSS の登録がまだで引き落とせない請求</strong>を確認します。引き落とせない請求は「振込に切り替える」を押し、請求書を送付します。</> },
              { title: "NSS へ金額を登録", body: <>「NSS登録用の一覧を作る」→「NSS登録用の一覧（CSV・確認用）」を見ながら NSS の収納リンクへ確定金額を登録 →「NSSへ登録した」。</> },
              { title: "結果の反映", body: <>引き落とし日のあと、NSS の振替結果を見ながら「結果を反映する」。引き落とせなかったものだけ「不可」にして理由（残高不足など）を選びます。成功分は入金済み、不可は「引落失敗」になります。</> },
              { title: "引き落とし不可のフォロー", body: <>お客様へ連絡し、「振込に切り替える」→ 請求書・督促メールを送ります。</> },
            ]}
          />
        </Section>

        {/* 過去のお客様 */}
        <Section
          id="past"
          icon={History}
          title="過去のお客様（契約書が無い・旧「顧客ステータス」で管理していたお客様）"
          description="受注管理になる前から管理していたお客様や、書面・口頭で契約したお客様も、同じ受注管理で請求書の発行から入金確認まで追えます。"
        >
          <h3 className="mb-2 text-sm font-semibold">旧「顧客ステータス」の記録は引き継がれます</h3>
          <Table>
            <THead>
              <TR>
                <TH>旧画面で置いていたステージ</TH>
                <TH>受注管理で「済み」として引き継ぐもの</TH>
              </TR>
            </THead>
            <TBody>
              <TR><TD className="font-medium">初回請求</TD><TD>契約・申込内容の確認</TD></TR>
              <TR><TD className="font-medium">振替手続き・入金チェック</TD><TD>契約・申込内容の確認・初回請求書の発行と送付</TD></TR>
              <TR><TD className="font-medium">運用中</TD><TD>上記に加えて、初回入金の確認</TD></TR>
            </TBody>
          </Table>
          <p className="mt-2 text-sm text-muted-foreground">
            旧画面で付けたチェック（締結を確認・初回請求書を発行・初回振込の入金を確認）もそのまま使います。システムに契約書・請求書がある手続きは、そちらのデータで判定します。
            案件ページの上に「旧「顧客ステータス」で〜まで進めていた案件です」と表示され、違っていれば各項目の「取り消す」で直せます。
          </p>

          <h3 className="mb-2 mt-5 text-sm font-semibold">契約書が無いお客様の進め方</h3>
          <Steps
            steps={[
              { title: "契約を記録", body: <>案件ページの「契約を締結」の行で「書面・旧運用で締結済み」を押します（電子契約を送るなら「契約書を作成」）。</> },
              { title: "請求を開始", body: <>「受注確認」に並ぶので「請求を開始」を押し、初回請求書と毎月の請求をまとめて設定します。初回請求書は「このシステムで作成する」「作成済みの請求書を初回請求書にする」「システムの外で発行済み」「初回請求なし」から選びます。</> },
              { title: "毎月の請求を登録", body: <>プラン・オプション・店舗数・個別価格と<strong>「このシステムで請求を始める月」</strong>を決めます。システムの外で請求済みの月を選ぶと、さかのぼって請求書が作られるので注意してください（初期値は翌月）。</> },
              { title: "入金を確認", body: <>このシステムの請求書は <StepLink href="/payments">入金確認</StepLink> で消し込むと自動で ✓ が付きます。システムの外で発行した請求書は、入金を確認したら「入金を確認済みにする」を押します。</> },
            ]}
          />
          <Callout>
            請求書の画面で<strong>区分「初期費用」</strong>を選んで作った請求書は、受注管理の初回請求書として扱われます。「都度」で作ってしまった場合も、案件ページの「請求書を紐付ける」（または「請求を開始」の「作成済みの請求書を初回請求書にする」）で初回請求書にできます。
            「休止」にしたお客様も、請求書の作成画面の「休止中のお客様」から選べます。
          </Callout>
        </Section>

        {/* 代理店 */}
        <Section id="agency" icon={Handshake} title="代理店（取次型 / 営業・初期設定型）" description="代理店の報酬は、獲得したお客様の初期費用（税抜）× 区分の率です。">
          <Table>
            <THead>
              <TR>
                <TH>区分</TH>
                <TH>代理店が担当する範囲</TH>
                <TH>報酬</TH>
                <TH>例（初期費用 {formatJPY(EXAMPLE_INITIAL_FEE)}）</TH>
              </TR>
            </THead>
            <TBody>
              {AGENCY_DEAL_TYPE_KEYS.map((t) => (
                <TR key={t}>
                  <TD><DealTypeBadge dealType={t} /></TD>
                  <TD className="text-sm">{AGENCY_DEAL_TYPES[t].scope}</TD>
                  <TD className="font-medium">{agencyRateLabel(t)}</TD>
                  <TD className="tabular font-medium">{formatJPY(agencyCommissionAmount(EXAMPLE_INITIAL_FEE, t))}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Steps
            className="mt-4"
            steps={[
              { title: "代理店を登録", body: <><StepLink href="/agencies">代理店</StepLink>「新規代理店」で区分を選んで登録し、営業マンを追加します。</> },
              { title: "代理店URLを発行して渡す", body: <>代理店ページの「URLを発行」。営業担当ごとに分けると担当別の実績が出ます。「案内文ごとコピー」で使い方つきの文面を代理店へ送れます。</> },
              { title: "お客様が「相談」か「申込」", body: <>「まずは相談したい」は <StepLink href="/referrals">紹介・問い合わせ</StepLink> に代理店経由として届きます（連絡後に申込・契約URLを送る）。「このまま申し込む」は申込＋電子署名まで完了し、受注管理に並びます。</> },
              { title: "受注確定で報酬が決まる", body: <>初期費用 × 率 を計上。<strong>お客様の初期費用の入金を確認した月</strong>の支払明細に入ります（入金前は「初期費用の入金待ち」）。</> },
              { title: "毎月の支払い", body: <>代理店ページで月を選び、明細をメール送付・印刷。支払ったら「支払済みにする」。未払いは月をまたいで一覧に残ります。</> },
            ]}
          />
          <p className="mt-3 text-sm text-muted-foreground">
            案件ごとに区分を変えたいときは、顧客の「編集」で「代理店区分（この顧客）」を選びます。伴走型（導入後の運用支援まで担当）は今後追加予定です。
          </p>
        </Section>

        {/* 紹介 */}
        <Section id="referral" icon={Gift} title="紹介制度（お客様からのご紹介）" description={`紹介した方へ初期費用の${Math.round(REFERRAL_REWARD_RATE * 100)}%、紹介された方は初月の端数日数＋${REFERRAL_FREE_MONTHS}ヶ月無料。`}>
          <Steps
            steps={[
              { title: "紹介フォームを配る", body: <><StepLink href="/referrals">紹介・問い合わせ</StepLink> の常設URL（/refer）か、紹介者を指定したURLをお客様に渡します。</> },
              { title: "連絡希望の日時にご連絡", body: <>希望日を過ぎると赤く表示されます。</> },
              { title: "申込・契約URLを送る", body: <>その行の「申込・契約URLを発行」。紹介者の紐付けと特典が自動で引き継がれます（フォームに名前・連絡先も入った状態で開きます）。</> },
              { title: "受注確定で特典が自動適用", body: <>初月日割りが0円、毎月の請求が{REFERRAL_FREE_MONTHS}ヶ月先から。紹介者へのお支払い額も確定し「お支払い待ち」に出ます。</> },
            ]}
          />
        </Section>

        {/* NSS */}
        <Section id="nss" icon={Landmark} title="NSS とこのツールの役割分担" description="NSS（日本システム収納）だけを使う運用に合わせて、このツールの口座振替機能を整理しました。">
          <Table>
            <THead>
              <TR>
                <TH>項目</TH>
                <TH>NSS で行うこと</TH>
                <TH>このツールで行うこと</TH>
              </TR>
            </THead>
            <TBody>
              <TR><TD className="font-medium">口座情報</TD><TD>登録・保管（依頼書から自動取込）</TD><TD>持たない（旧運用で保存した口座番号は顧客・案件ページから消去できます）</TD></TR>
              <TR><TD className="font-medium">登録の進み具合</TD><TD>—</TD><TD>依頼書の郵送 → 回収 → NSSへ登録 → 登録完了・振替開始月 を記録し、遅れを知らせる</TD></TR>
              <TR><TD className="font-medium">毎月の金額</TD><TD>収納リンクへ確定金額を登録</TD><TD>引き落とせる／引き落とせない請求の振り分け、登録用の一覧（CSV・確認用）</TD></TR>
              <TR><TD className="font-medium">引き落とし</TD><TD>実行（毎月27日予定）</TD><TD>—</TD></TR>
              <TR><TD className="font-medium">結果</TD><TD>振替結果を提供</TD><TD>請求へ反映（成功 = 入金済／不可 = 要フォロー）</TD></TR>
            </TBody>
          </Table>
          <Callout>
            <strong>「口座振替機能はもういらないの？」</strong> —
            口座情報の登録・汎用の収納代行向けCSV・結果の自動判定（登録状態だけで成功扱いにしていた処理）は不要なので無くしました。
            一方で「誰が NSS 登録済みか」「今月 NSS にいくら登録するか」「引き落とし結果を請求に反映する」は NSS の外でしか管理できず、
            無いと入金確認の抜け漏れになるため、<StepLink href="/direct-debit">NSS引き落とし</StepLink> として残しています。
          </Callout>
        </Section>

        {/* 抜け漏れ */}
        <Section id="omissions" icon={AlertTriangle} title="よくある抜け漏れと防ぎ方" description="これまで起きやすかった漏れと、いまの仕組みでの防ぎ方です。">
          <Table>
            <THead>
              <TR>
                <TH>起きやすい漏れ</TH>
                <TH>いまの防ぎ方</TH>
              </TR>
            </THead>
            <TBody>
              <OmissionRow risk="申込は届いたのに契約書を送り忘れる" fix="申込と契約を1本のURLに統合。「申込のみ」URLから届いた申込は、顧客登録するまで受注管理の対応待ちの先頭に、登録後は「契約書の作成・送付」として残ります。" />
              <OmissionRow risk="締結したのに請求を始め忘れる" fix="締結済みは「受注確認」として受注管理とホームのいちばん上に出続けます。" />
              <OmissionRow risk="初回請求書を作ったが送っていない" fix="「初回請求書の送付」に ✓ が付くまで対応待ちに残ります（案件ページの「メールで送付」なら自動で ✓。入金を確認した場合も自動で ✓）。" />
              <OmissionRow risk="口座振替依頼書が戻ってこない" fix="郵送から14日を超えると「要確認」と赤く表示されます。" />
              <OmissionRow risk="NSS 登録が終わる前の月の請求が引き落とされない" fix="NSS引き落とし画面に「引き落とせない請求」として出ます。「振込に切り替える」で案内文も振込に変わります。" />
              <OmissionRow risk="NSS に登録したが結果を反映していない" fix="一覧が「NSS登録済・結果待ち」のまま残り、引き落とし日以降に反映を促します。" />
              <OmissionRow risk="毎月の請求書が引き落とし日の当日にでき、確認期間と NSS への登録が間に合わない" fix="毎月1日にその月の請求書を作成・送付するよう修正しました（引き落としは27日）。" />
              <OmissionRow risk="複数店舗なのに毎月1店舗分しか請求されない" fix="店舗数を定期契約に保存し、毎月の請求書に「単価 × 店舗数」で載るよう修正しました。" />
              <OmissionRow risk="代理店報酬の計上漏れ・払い忘れ・二重払い" fix="受注確定で自動計上（同じ請求に二重計上しない）。初期費用の入金後に支払対象になり、支払済みを記録します。" />
              <OmissionRow risk="紹介特典の適用漏れ" fix="紹介からのURLで申し込めば、受注確定で特典が自動適用されます。" />
              <OmissionRow risk="過去のお客様（契約書が無い・旧画面で進めていた）の請求書発行・入金確認が漏れる" fix="旧画面の記録を引き継ぎ、「請求を開始」「入金を確認済みにする」で同じ受注管理で追えます。定期契約が無ければ「毎月の請求（定期契約）を登録」が対応待ちに残ります。" />
            </TBody>
          </Table>
        </Section>

        {/* 旧運用 */}
        <Section id="legacy" icon={ArrowRightLeft} title="旧運用・旧画面からの置き換え" description="これまでのツール・シート・画面が、いまのどの機能に当たるかです。">
          <Table>
            <THead>
              <TR>
                <TH>旧ツール / 旧画面</TH>
                <TH>いまの機能</TH>
              </TR>
            </THead>
            <TBody>
              <TR><TD className="font-medium">初期入力シート・入力用スプレッドシート（住所回収）</TD><TD>申込・契約URL（お客様が入力）</TD></TR>
              <TR><TD className="font-medium">紙の契約書・申込書</TD><TD>申込・契約URLの電子署名（条文を変える場合は「契約書」から個別作成。紙は「書面締結を登録」）</TD></TR>
              <TR><TD className="font-medium">入力用スプレッドシート（請求金額）</TD><TD><StepLink href="/invoices">請求書</StepLink>（定期分は自動作成・自動送付、変動費は明細追加）</TD></TR>
              <TR><TD className="font-medium">NSS システム（収納サイト）</TD><TD>従来どおり NSS で登録。終わったら案件ページで「NSSへ登録した」「登録完了」</TD></TR>
              <TR><TD className="font-medium">NSS システム（収納リンク）</TD><TD><StepLink href="/direct-debit">NSS引き落とし</StepLink> で一覧 → CSV → NSSへ登録 → 結果を反映</TD></TR>
              <TR><TD className="font-medium">旧「顧客ステータス」（カンバン）</TD><TD><StepLink href="/orders">受注管理</StepLink>（ステージは自動。旧画面で手で進めていた記録は引き継ぎ。旧URLを開いても受注管理へ移動します）</TD></TR>
              <TR><TD className="font-medium">旧「申込」</TD><TD><StepLink href="/applications">申込・契約URL</StepLink></TD></TR>
              <TR><TD className="font-medium">旧「口座振替」（口座情報の登録・汎用CSV・バッチ処理）</TD><TD><StepLink href="/direct-debit">NSS引き落とし</StepLink>（口座情報は持たない・結果は実際の NSS の結果を反映）</TD></TR>
              <TR><TD className="font-medium">旧 代理店手数料（毎月の入金済売上 × 率）</TD><TD>初期費用 × 区分の率（取次型 50%／営業・初期設定型 100%）</TD></TR>
            </TBody>
          </Table>
        </Section>

        {/* 注意点 */}
        <Section id="notes" icon={AlertTriangle} title="引き継ぎ時の注意点">
          <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
            <li>口座振替依頼書・書面契約の<strong className="text-foreground">原本は本部保管</strong>です（電子契約は本ツールに契約書・締結証明書が保存されます）。</li>
            <li>毎月の請求は<strong className="text-foreground">確認期間（約{NSS_CONFIRMATION_DAYS}日）を必ず確保</strong>し、修正があれば請求書を訂正してから NSS へ登録してください。</li>
            <li>送付済み・締結済みの契約書は内容を変更できません。条件変更は取消のうえ新しい契約書（または新しい申込・契約URL）で行います。</li>
            <li>個別に作成した契約書のアクセスコードはメールに記載されません。<strong className="text-foreground">電話等の別経路で契約者本人に伝えてください</strong>。</li>
            <li>代理店の区分を途中で変えても、計上済みの報酬は変わりません（案件ごとに受注確定の時点の区分で計算します）。</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- 部品 */

function Section({
  id,
  icon: Icon,
  title,
  description,
  children,
}: {
  id: string;
  icon: React.ElementType;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-20">
      <CardHeader className="flex-row items-center gap-2">
        <Icon className="h-5 w-5 shrink-0 text-primary" />
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription className="mt-1">{description}</CardDescription>}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function SubCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </div>
      {children}
    </div>
  );
}

function Steps({
  steps,
  className,
}: {
  steps: { title: string; body: React.ReactNode }[];
  className?: string;
}) {
  return (
    <ol className={`space-y-4 ${className ?? ""}`}>
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <Num n={i + 1} soft />
          <div className="min-w-0 text-sm">
            <div className="font-semibold">{s.title}</div>
            <p className="mt-0.5 leading-relaxed text-muted-foreground">{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Num({ n, soft }: { n: number; soft?: boolean }) {
  return (
    <span
      className={
        soft
          ? "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold text-primary"
          : "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground"
      }
    >
      {n}
    </span>
  );
}

function RoleRow({
  step,
  who,
  where,
  done,
}: {
  step: string;
  who: string;
  where: React.ReactNode;
  done: string;
}) {
  return (
    <TR>
      <TD className="font-medium">{step}</TD>
      <TD>{who}</TD>
      <TD className="text-sm">{where}</TD>
      <TD className="text-sm text-muted-foreground">{done}</TD>
    </TR>
  );
}

function OmissionRow({ risk, fix }: { risk: string; fix: string }) {
  return (
    <TR>
      <TD className="font-medium">{risk}</TD>
      <TD className="text-sm text-muted-foreground">{fix}</TD>
    </TR>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-md border-l-4 border-primary bg-primary/5 p-3 text-sm leading-relaxed">
      {children}
    </div>
  );
}

function StepLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-primary hover:underline">
      {children}
    </Link>
  );
}
