"use client";

import { Check, Copy, ExternalLink, QrCode } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * URL を QR コードのパス(1モジュール=1マス)へ変換する。
 * 生成器は表示を要求されたときだけ動的読み込みする(初期バンドルを増やさない)。
 */
function useQrCode(value: string, enabled: boolean) {
  const [qr, setQr] = React.useState<{ path: string; size: number } | null>(null);
  React.useEffect(() => {
    if (!enabled || !value) return;
    let canceled = false;
    void (async () => {
      const { default: qrcode } = await import("qrcode-generator");
      const gen = qrcode(0, "M");
      gen.addData(value);
      gen.make();
      const size = gen.getModuleCount();
      let path = "";
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          if (gen.isDark(row, col)) path += `M${col} ${row}h1v1h-1z`;
        }
      }
      if (!canceled) setQr({ path, size });
    })();
    return () => {
      canceled = true;
    };
  }, [value, enabled]);
  return qr;
}

/** スキャンできるよう、テーマに関わらず白地・黒マスで描画する。 */
export function QrCodeImage({ value, className }: { value: string; className?: string }) {
  const qr = useQrCode(value, true);
  if (!qr) {
    return <div className={cn("h-44 w-44 animate-pulse rounded-md bg-muted", className)} />;
  }
  const quiet = 2; // 静穏域(4モジュール推奨だが枠の余白と合わせて2)
  const span = qr.size + quiet * 2;
  return (
    <svg
      viewBox={`${-quiet} ${-quiet} ${span} ${span}`}
      className={cn("h-44 w-44 rounded-md border border-border bg-white p-1", className)}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QRコード"
    >
      <rect x={-quiet} y={-quiet} width={span} height={span} fill="#ffffff" />
      <path d={qr.path} fill="#000000" />
    </svg>
  );
}

/**
 * お客様へ渡すURLの共有パネル（コピー / QRコード / 別タブで開く）。
 * メールを送らずに、LINE・SMS・対面などでリンクを渡す運用に使う。
 */
export function ShareLink({
  url,
  label,
  hint,
  className,
}: {
  url: string;
  label: string;
  hint?: React.ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const [showQr, setShowQr] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // クリップボードが使えない環境(権限拒否など)は選択用に表示する
      window.prompt("このURLをコピーしてお客様にお渡しください", url);
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={cn("rounded-md border border-border bg-muted/40 p-3 text-xs", className)}>
      <div className="font-medium">{label}</div>
      <p className="mt-1 break-all text-muted-foreground">{url}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "コピーしました" : "URLをコピー"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setShowQr((v) => !v)}
          aria-expanded={showQr}
        >
          <QrCode className="h-4 w-4" />
          {showQr ? "QRコードを隠す" : "QRコードを表示"}
        </Button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ExternalLink className="h-4 w-4" />
          開いて確認
        </a>
      </div>
      {showQr && (
        <div className="mt-3 flex flex-col items-center gap-1.5">
          <QrCodeImage value={url} />
          <p className="text-center text-[11px] text-muted-foreground">
            お客様のスマートフォンで読み取っていただけます。
          </p>
        </div>
      )}
      {hint && <div className="mt-2 text-muted-foreground">{hint}</div>}
    </div>
  );
}
