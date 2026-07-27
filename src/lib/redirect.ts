/**
 * ログイン後の遷移先を安全に決める。
 * 外部サイトへ飛ばされないよう、自サイト内の絶対パスのみを許可する。
 */
export function safeRedirectPath(value: string | null | undefined): string {
  if (!value) return "/";
  // "//example.com" や "/\\example.com" は外部扱いになるため拒否
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/";
  }
  return value;
}
