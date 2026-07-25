"use client";

import { RefreshCcw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  addDevIssueAttachmentAction,
  generateUiMockAction,
} from "@/app/actions/dev-issues";
import { WireframeSvg } from "@/components/dev/wireframe";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Select, Textarea } from "@/components/ui/input";
import type { UiMockSpec } from "@/lib/ai/mock";
import { svgToPngDataUrl } from "@/lib/images";

/**
 * AIモック生成 — 理想のUIをエンジニアに伝えるための画像モック。
 * 生成するのは軽量なレイアウト定義のみ(消費は小さい)。画像化はこの場で行い、
 * 依頼の添付画像として保存する(スクショ同様に書き込みも可能)。
 */
export function MockGeneratorButton({
  issueId,
  issueTitle,
}: {
  issueId: string;
  issueTitle: string;
}) {
  const router = useRouter();
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [open, setOpen] = React.useState(false);
  const [description, setDescription] = React.useState(issueTitle);
  const [device, setDevice] = React.useState<"mobile" | "desktop">("mobile");
  const [spec, setSpec] = React.useState<UiMockSpec | null>(null);
  const [sample, setSample] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [generating, setGenerating] = React.useState(false);
  const [attaching, setAttaching] = React.useState(false);

  const generate = async () => {
    setError(null);
    setGenerating(true);
    try {
      const res = await generateUiMockAction(description, device);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSpec(res.spec);
      setSample(res.sample);
    } finally {
      setGenerating(false);
    }
  };

  const attach = async () => {
    if (!svgRef.current || !spec) return;
    setError(null);
    setAttaching(true);
    try {
      const png = await svgToPngDataUrl(svgRef.current, { scale: 2 });
      const res = await addDevIssueAttachmentAction(issueId, {
        fileName: `モック-${spec.title}.png`,
        contentType: "image/png",
        dataUrl: png,
        kind: "mock",
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setSpec(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAttaching(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Sparkles className="h-4 w-4" />
        AIモック生成
      </Button>

      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title="画像モックをAIで生成"
          description="理想のUIを文章で伝えると、ざっくり伝わるワイヤーフレーム画像を作ります(軽量な定義だけ生成するので消費は小さめ)。"
          className="sm:max-w-3xl"
        >
          <div className="space-y-4">
            <Field label="どんな画面にしたいか">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder={"例: プリペイドカードのチャージ画面。残高が大きく見えて、チャージ金額のボタンが並び、履歴の一覧が下にある。"}
              />
            </Field>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="端末" className="w-40">
                <Select
                  value={device}
                  onChange={(e) => setDevice(e.target.value as "mobile" | "desktop")}
                >
                  <option value="mobile">スマホ</option>
                  <option value="desktop">PC</option>
                </Select>
              </Field>
              <Button type="button" onClick={generate} disabled={generating || !description.trim()}>
                {spec ? <RefreshCcw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                {generating ? "生成中…" : spec ? "作り直す" : "生成する"}
              </Button>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {spec && (
              <div className="space-y-3">
                {sample && (
                  <p className="rounded-md bg-secondary px-3 py-2 text-xs text-secondary-foreground">
                    APIキー未設定のため<span className="font-medium">サンプルのモック</span>を表示しています(本番では依頼内容に合わせてAIが構成します)。
                  </p>
                )}
                <div className="mx-auto max-h-[50vh] overflow-auto rounded-md border border-border bg-muted/30 p-3">
                  <div className={spec.device === "mobile" ? "mx-auto max-w-[320px]" : ""}>
                    <WireframeSvg ref={svgRef} spec={spec} />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={attaching}>
                    キャンセル
                  </Button>
                  <Button type="button" onClick={attach} disabled={attaching}>
                    {attaching ? "添付中…" : "画像として添付"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
