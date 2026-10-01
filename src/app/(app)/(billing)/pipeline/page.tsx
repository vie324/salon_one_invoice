import { redirect } from "next/navigation";

/**
 * 旧「顧客ステータス(カンバン)」。受注管理(/orders)に統合したため転送する
 * (ブックマーク・共有済みのURLを開いても迷わないように残している)。
 */
export default function PipelinePage() {
  redirect("/orders");
}
