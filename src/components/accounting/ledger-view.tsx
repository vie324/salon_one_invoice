import Link from "next/link";
import { invoiceStatusLabels } from "@/lib/domain/constants";
import { monthLabel, revenueKindLabels, type RevenueLedger, type RevenueLine } from "@/lib/domain/revenue";
import { cn, formatJPY } from "@/lib/utils";

/**
 * 売上台帳の表(画面と印刷で共通)。
 * 月別の売上 → お客様別 → 明細 → 支払(代理店報酬・紹介謝礼) の順に並べる。
 */
export function LedgerView({ ledger, print = false }: { ledger: RevenueLedger; print?: boolean }) {
  const fy = ledger.fiscalYear;
  const linesByMonth = fy.months
    .map((m) => ({ month: m, lines: ledger.lines.filter((l) => l.month === m) }))
    .filter((g) => g.lines.length > 0);

  return (
    <div className={cn("space-y-6", print && "space-y-8 text-[11px]")}>
      {/* 1. 月別の売上 */}
      <Section title="月別の売上" note="税抜。消費税は請求書ごとの税率別の消費税を明細に割り振っています。">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm print:min-w-0 print:text-[10px]">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <Th className="text-left">計上月</Th>
                <Th>初期費用</Th>
                <Th>月額</Th>
                <Th>その他</Th>
                <Th className="text-foreground">売上（税抜）</Th>
                <Th>消費税</Th>
                <Th>売上（税込）</Th>
                <Th>支払（代理店・紹介）</Th>
              </tr>
            </thead>
            <tbody>
              {ledger.months.map((m) => (
                <tr key={m.month} className="border-b border-border/60">
                  <td className="py-2 pr-3 text-left">{monthLabel(m.month)}</td>
                  <Num value={m.initial} />
                  <Num value={m.monthly} />
                  <Num value={m.other} />
                  <Num value={m.sales} strong />
                  <Num value={m.tax} />
                  <Num value={m.total} />
                  <Num value={m.payouts} />
                </tr>
              ))}
              <tr className="bg-muted/50 font-semibold">
                <td className="py-2 pr-3 text-left">合計</td>
                <Num value={ledger.totals.initial} />
                <Num value={ledger.totals.monthly} />
                <Num value={ledger.totals.other} />
                <Num value={ledger.totals.sales} strong />
                <Num value={ledger.totals.tax} />
                <Num value={ledger.totals.total} />
                <Num value={ledger.totals.payouts} />
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* 2. お客様別 */}
      <Section title="お客様別の売上（税抜）" note="合計の右に、ひと月ごとの売上を並べています。">
        {ledger.customers.length === 0 ? (
          <Empty />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-xs print:min-w-0 print:text-[8.5px]">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <Th className="sticky left-0 bg-card text-left print:static">お客様</Th>
                  <Th className="border-r border-border pr-3 text-foreground">合計</Th>
                  {fy.months.map((m, i) => (
                    <Th key={m}>
                      {(i === 0 || m.endsWith("-01")) && (
                        <span className="block text-[10px] font-normal">{m.slice(0, 4)}年</span>
                      )}
                      {Number(m.slice(5))}月
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ledger.customers.map((c) => (
                  <tr key={c.customerId} className="border-b border-border/60">
                    <td className="sticky left-0 max-w-[14rem] bg-card py-1.5 pr-3 text-left print:static">
                      <div className="truncate font-medium print:whitespace-normal">{c.customerName}</div>
                      <div className="text-[10px] text-muted-foreground">{c.customerCode}</div>
                    </td>
                    <Num value={c.total} strong className="border-r border-border pr-3" />
                    {fy.months.map((m) => (
                      <Num key={m} value={c.byMonth[m] ?? 0} dashZero />
                    ))}
                  </tr>
                ))}
                <tr className="bg-muted/50 font-semibold">
                  <td className="sticky left-0 bg-muted py-1.5 pr-3 text-left print:static">合計</td>
                  <Num value={ledger.totals.sales} strong className="border-r border-border pr-3" />
                  {ledger.months.map((m) => (
                    <Num key={m.month} value={m.sales} dashZero />
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* 3. 明細 */}
      <Section
        title="明細"
        note="請求書の明細1行ごとです。計上月はサービスを提供した月で、請求書の発行日とずれることがあります。"
      >
        {linesByMonth.length === 0 ? (
          <Empty />
        ) : (
          <div className="space-y-5">
            {linesByMonth.map((g) => {
              const sales = g.lines.reduce((s, l) => s + l.amount, 0);
              const tax = g.lines.reduce((s, l) => s + l.tax, 0);
              return (
                <div key={g.month} className="break-inside-avoid-page">
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-1 print:break-after-avoid">
                    <h3 className="text-sm font-semibold">{monthLabel(g.month)}</h3>
                    <span className="tabular text-xs text-muted-foreground">
                      {g.lines.length}行・売上（税抜）{formatJPY(sales)}・消費税 {formatJPY(tax)}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] border-collapse text-xs print:min-w-0 print:text-[9px]">
                      <thead>
                        <tr className="text-muted-foreground">
                          <Th className="text-left">請求書</Th>
                          <Th className="text-left">お客様</Th>
                          <Th className="text-left">品目</Th>
                          <Th className="text-left">区分</Th>
                          <Th>税抜</Th>
                          <Th>消費税</Th>
                          <Th>税込</Th>
                          <Th className="text-left">入金</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.lines.map((l) => (
                          <LineRow key={l.key} line={l} print={print} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* 4. 支払 */}
      <Section
        title="支払（代理店報酬・紹介謝礼）"
        note="対象のお客様の初期費用を計上した月に並べています。"
      >
        {ledger.payouts.length === 0 ? (
          <Empty text="この期の支払はありません。" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-xs print:min-w-0 print:text-[9px]">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <Th className="text-left">計上月</Th>
                  <Th className="text-left">区分</Th>
                  <Th className="text-left">支払先</Th>
                  <Th className="text-left">対象のお客様</Th>
                  <Th className="text-left">内容</Th>
                  <Th>金額</Th>
                  <Th className="text-left">支払日</Th>
                </tr>
              </thead>
              <tbody>
                {ledger.payouts.map((p) => (
                  <tr key={p.key} className="border-b border-border/60">
                    <td className="py-1.5 pr-3">{monthLabel(p.month)}</td>
                    <td className="py-1.5 pr-3">{p.kind === "agency" ? "代理店報酬" : "紹介謝礼"}</td>
                    <td className="py-1.5 pr-3">{p.payee}</td>
                    <td className="py-1.5 pr-3">{p.customerName}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{p.detail}</td>
                    <Num value={p.amount} />
                    <td className="py-1.5 pl-3">{p.paidAt ? p.paidAt.replace(/-/g, "/") : "未払い"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

function LineRow({ line: l, print }: { line: RevenueLine; print: boolean }) {
  const status = l.paid
    ? `入金済 ${l.paidDate ? l.paidDate.slice(5).replace("-", "/") : ""}`.trim()
    : invoiceStatusLabels[l.status];
  return (
    <tr className="border-b border-border/60 align-top">
      <td className="py-1.5 pr-3">
        {print ? (
          <span className="tabular">{l.invoiceNumber}</span>
        ) : (
          <Link
            href={`/print/invoices/${l.invoiceId}`}
            target="_blank"
            className="tabular text-primary hover:underline"
          >
            {l.invoiceNumber}
          </Link>
        )}
        <div className="text-[10px] text-muted-foreground">発行 {l.issueDate.replace(/-/g, "/")}</div>
      </td>
      <td className="py-1.5 pr-3">
        {l.customerName}
        <div className="text-[10px] text-muted-foreground">{l.customerCode}</div>
      </td>
      <td className="py-1.5 pr-3">
        {l.description}
        {l.monthSource === "issue" && (
          <div className="text-[10px] text-muted-foreground">計上月の指定なし（発行月で計上）</div>
        )}
      </td>
      <td className="whitespace-nowrap py-1.5 pr-3">{revenueKindLabels[l.kind]}</td>
      <Num value={l.amount} />
      <Num value={l.tax} />
      <Num value={l.total} />
      <td
        className={cn(
          "whitespace-nowrap py-1.5 pl-3",
          l.paid ? "text-success" : l.status === "overdue" ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {status}
      </td>
    </tr>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm print:break-inside-auto print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-5">
      {/* 印刷で見出しと説明が離れたり、見出しだけページの下に残ったりしないように */}
      <div className="mb-3 print:break-inside-avoid print:break-after-avoid">
        <h2 className="text-base font-semibold print:text-sm">{title}</h2>
        {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Th({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <th className={cn("whitespace-nowrap px-1 py-2 text-right font-medium", className)}>{children}</th>;
}

/** 金額のセル。0円は薄く出す(売上のある月が目に入りやすいように)。dashZero なら「—」にする */
function Num({
  value,
  strong,
  dashZero,
  className,
}: {
  value: number;
  strong?: boolean;
  dashZero?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "tabular whitespace-nowrap px-1 py-1.5 text-right",
        strong && "font-semibold",
        value === 0 && "text-muted-foreground",
        className,
      )}
    >
      {dashZero && value === 0 ? "—" : formatJPY(value)}
    </td>
  );
}

function Empty({ text = "この期の売上はまだありません。" }: { text?: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>;
}
