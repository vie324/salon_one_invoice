import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * トップ。開いた直後は「進捗ホーム」を出す。
 * 売上・開発のどちらを表示するかは /home 側で役割から判定する
 * (ホーム画面に追加した PWA の起動先もここ)。
 */
export default function Home() {
  redirect("/home");
}
