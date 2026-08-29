"use client";

import { Check, Copy, ExternalLink, MessageSquareShare, QrCode, Share2 } from "lucide-react";
import * as React from "react";
import { QrCodeImage } from "@/components/share/share-link";
import { Button, buttonClasses } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { canNativeShare, copyText, nativeShare, toAbsoluteUrl } from "@/lib/share";
import { cn } from "@/lib/utils";

export interface ShareTarget {
  /** 共有する URL。相対パス(/d/12)で渡すと絶対 URL に変換する */
  url: string;
  /** 共有シートのタイトル */
  title: string;
  /** 本文つき共有・コピーに使う説明文(URL は自動で末尾に付く) */
  text?: string;
}

/**
 * 端末の共有シート(LINE・メール・Slack・AirDrop 等)を1タップで開くボタン。
 *
 * スマホでは navigator.share が使えるため、押した瞬間に共有先の一覧が出る。
 * 共有シートが無い環境(PC ブラウザ等)や、QR コード・本文つきコピーが要る
 * ときのために、右側の「…」から詳しい共有メニューを開ける。
 */
export function ShareButton({
  target,
  label = "共有",
  variant = "outline",
  size = "sm",
  className,
}: {
  target: ShareTarget;
  label?: string;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [supportsNative, setSupportsNative] = React.useState(false);
  const [origin, setOrigin] = React.useState("");

  React.useEffect(() => {
    setSupportsNative(canNativeShare());
    setOrigin(window.location.origin);
  }, []);

  const absolute = toAbsoluteUrl(target.url, origin);
  const body = target.text ? `${target.text}\n${absolute}` : absolute;

  const onPrimary = async () => {
    if (supportsNative) {
      const shared = await nativeShare({ title: target.title, text: target.text, url: absolute });
      if (shared) return;
    }
    setSheetOpen(true);
  };

  return (
    <>
      <div className={cn("inline-flex items-center gap-1", className)}>
        <Button type="button" variant={variant} size={size} onClick={() => void onPrimary()}>
          <Share2 className="h-4 w-4" />
          {label}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size={size}
          onClick={() => setSheetOpen(true)}
          aria-label="共有の方法を選ぶ"
          className="px-2"
        >
          <QrCode className="h-4 w-4" />
        </Button>
      </div>

      <ShareSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        target={target}
        absolute={absolute}
        body={body}
        supportsNative={supportsNative}
      />
    </>
  );
}

/** 共有メニュー本体(ボトムシート)。単独でも開けるように export する。 */
export function ShareSheet({
  open,
  onClose,
  target,
  absolute,
  body,
  supportsNative,
}: {
  open: boolean;
  onClose: () => void;
  target: ShareTarget;
  absolute: string;
  body: string;
  supportsNative: boolean;
}) {
  const [copied, setCopied] = React.useState<"url" | "text" | null>(null);
  const [showQr, setShowQr] = React.useState(false);

  const flash = (kind: "url" | "text") => {
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1800);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="共有する"
      description="このページのリンクを、相手に届く形でお渡しします。"
    >
      <div className="space-y-3">
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5">
          <div className="text-xs font-medium text-muted-foreground">共有するリンク</div>
          <p className="tabular mt-1 select-all break-all text-sm font-medium">{absolute}</p>
        </div>

        {supportsNative && (
          <Button
            type="button"
            className="w-full"
            size="lg"
            onClick={() =>
              void nativeShare({ title: target.title, text: target.text, url: absolute }).then(
                (ok) => ok && onClose(),
              )
            }
          >
            <Share2 className="h-4 w-4" />
            LINE・メールなどで送る
          </Button>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => void copyText(absolute).then(() => flash("url"))}
          >
            {copied === "url" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied === "url" ? "コピーしました" : "URLをコピー"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => void copyText(body).then(() => flash("text"))}
          >
            {copied === "text" ? (
              <Check className="h-4 w-4" />
            ) : (
              <MessageSquareShare className="h-4 w-4" />
            )}
            {copied === "text" ? "コピーしました" : "本文つきでコピー"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => setShowQr((v) => !v)}
            aria-expanded={showQr}
          >
            <QrCode className="h-4 w-4" />
            {showQr ? "QRコードを隠す" : "QRコードで渡す"}
          </Button>
          <a
            href={absolute}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses({ variant: "outline", size: "lg" })}
          >
            <ExternalLink className="h-4 w-4" />
            開いて確認
          </a>
        </div>

        {showQr && (
          <div className="flex flex-col items-center gap-1.5 rounded-md border border-border bg-card p-3">
            <QrCodeImage value={absolute} />
            <p className="text-center text-[11px] text-muted-foreground">
              相手のスマートフォンのカメラで読み取ると、そのまま開けます。
            </p>
          </div>
        )}

        {target.text && (
          <div className="rounded-md border border-dashed border-border px-3 py-2.5">
            <div className="text-xs font-medium text-muted-foreground">送られる本文</div>
            <p className="mt-1 whitespace-pre-wrap break-all text-xs leading-relaxed text-muted-foreground">
              {body}
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
