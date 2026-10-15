"use client";

import { Printer } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";

/**
 * 印刷ダイアログを開くボタン(ダイアログの送信先で「PDFに保存」を選ぶと PDF になる)。
 * auto を付けると、ページを開いた直後に一度だけダイアログを開く。
 */
export function PrintButton({ label = "印刷 / PDF保存", auto = false }: { label?: string; auto?: boolean }) {
  React.useEffect(() => {
    if (!auto) return;
    // フォント・レイアウトの描画を待ってから開く
    const timer = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(timer);
  }, [auto]);

  return (
    <Button onClick={() => window.print()} size="sm">
      <Printer className="h-4 w-4" />
      {label}
    </Button>
  );
}
