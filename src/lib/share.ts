/**
 * リンク共有のヘルパー。
 *
 * 開発進捗の項目は UUID の長い URL(/dev/709b10f2-...)ではなく、
 * 依頼番号を使った短い URL(/d/12)で渡せるようにしている。
 * LINE・SMS・口頭のどれでも伝えやすく、打ち間違いも起きにくい。
 */

/** 依頼番号から短縮パスを作る (#12 → /d/12) */
export function devIssueShortPath(issueNumber: number): string {
  return `/d/${issueNumber}`;
}

/** 相対パスを、いま開いているサイトの絶対 URL にする(クライアント専用) */
export function toAbsoluteUrl(path: string, origin?: string): string {
  const base = origin ?? (typeof window === "undefined" ? "" : window.location.origin);
  if (!base) return path;
  try {
    return new URL(path, base).toString();
  } catch {
    return path;
  }
}

/**
 * クリップボードへコピーする。
 * navigator.clipboard は https 以外や権限拒否で使えないことがあるため、
 * 旧来の execCommand → 最後は手動コピー用のプロンプトへ段階的に落とす。
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 次の手段へ */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    if (ok) return true;
  } catch {
    /* 次の手段へ */
  }
  window.prompt("このURLをコピーしてお渡しください", text);
  return false;
}

/** 端末の共有シート(LINE・メール・AirDrop 等)が使えるか */
export function canNativeShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/**
 * 端末の共有シートを開く。
 * 利用者が閉じた場合(AbortError)は false を返し、呼び出し側では何もしない。
 */
export async function nativeShare(data: {
  title?: string;
  text?: string;
  url?: string;
}): Promise<boolean> {
  if (!canNativeShare()) return false;
  try {
    await navigator.share(data);
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return false;
    return false;
  }
}
