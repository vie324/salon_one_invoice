import type { InvoiceItem } from "@/lib/domain/types";
import { genId } from "@/lib/utils";
import type { InvoiceItemInput } from "./repository";

/**
 * 画面から受け取った明細を検証して、保存する形にそろえる(デモ/Supabase 共通)。
 * 品目が空の行は捨てる。数量・単価は0以上、税率は 0 / 8% / 10%。
 */
export function normalizeItemInputs(inputs: InvoiceItemInput[]): InvoiceItem[] {
  const items: InvoiceItem[] = [];
  for (const it of inputs) {
    const description = (it.description ?? "").trim();
    if (!description) continue;
    const quantity = Number(it.quantity);
    const unitPrice = Number(it.unitPrice);
    const taxRate = Number(it.taxRate);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`「${description}」の数量は1以上にしてください`);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error(`「${description}」の単価は0円以上にしてください`);
    if (![0, 0.08, 0.1].includes(taxRate)) throw new Error(`「${description}」の税率が正しくありません`);
    items.push({
      id: genId("it"),
      description,
      quantity,
      unitPrice: Math.round(unitPrice),
      taxRate,
      amount: Math.round(quantity * Math.round(unitPrice)),
    });
  }
  if (items.length === 0) throw new Error("明細を1行以上入力してください");
  return items;
}
