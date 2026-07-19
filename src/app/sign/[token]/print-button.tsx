"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SignPagePrintButton() {
  return (
    <Button onClick={() => window.print()} size="sm" variant="outline">
      <Printer className="h-4 w-4" />
      印刷 / PDF保存
    </Button>
  );
}
