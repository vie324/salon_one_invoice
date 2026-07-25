"use client";

import { ImagePlus, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  addDevIssueAttachmentAction,
  createDevIssueAction,
} from "@/app/actions/dev-issues";
import { ImageAnnotator } from "@/components/dev/image-annotator";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import {
  devIssueCategoryLabels,
  devIssuePriorityLabels,
} from "@/lib/domain/constants";
import type { DevIssueCategory, DevIssuePriority } from "@/lib/domain/types";
import {
  fileToProcessedDataUrl,
  imageFilesFromClipboard,
  useImageDropzone,
} from "@/lib/images";
import { cn } from "@/lib/utils";

interface PendingImage {
  dataUrl: string;
  contentType: string;
  fileName: string;
}

/** 注釈保存時のファイル名(重複しても分かるように) */
function annotatedFileName(name: string): string {
  if (name.includes("注釈入り")) return name;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}-注釈入り.png`;
}

export function NewIssueForm() {
  const router = useRouter();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [title, setTitle] = React.useState("");
  const [category, setCategory] = React.useState<DevIssueCategory>("bug");
  const [priority, setPriority] = React.useState<DevIssuePriority>("medium");
  const [detail, setDetail] = React.useState("");
  const [images, setImages] = React.useState<PendingImage[]>([]);
  const [annotateIndex, setAnnotateIndex] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const addFiles = async (files: File[]) => {
    setError(null);
    try {
      const added: PendingImage[] = [];
      for (const file of files) {
        const { dataUrl, contentType } = await fileToProcessedDataUrl(file);
        added.push({ dataUrl, contentType, fileName: file.name || "screenshot.png" });
      }
      setImages((list) => [...list, ...added]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const { dragging, dropProps } = useImageDropzone((files) => void addFiles(files));

  // フォーム上でのクリップボード貼り付け(スクショを Ctrl+V で添付)
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = imageFilesFromClipboard(e);
      if (files.length > 0) {
        e.preventDefault();
        void addFiles(files);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createDevIssueAction({ title, category, priority, detail });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // 画像は依頼作成後に順次アップロード(失敗しても依頼は登録済み)
      for (const img of images) {
        const up = await addDevIssueAttachmentAction(res.id, {
          fileName: img.fileName,
          contentType: img.contentType,
          dataUrl: img.dataUrl,
          kind: "screenshot",
        });
        if (!up.ok) {
          setError(`依頼は登録しましたが、画像のアップロードに失敗しました: ${up.error}`);
          break;
        }
      }
      router.push(`/dev/${res.id}`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="課題名（修正や不具合のタイトル）">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: 継続決済が会計処理できない（千葉院）"
          required
          maxLength={200}
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="分類">
          <Select value={category} onChange={(e) => setCategory(e.target.value as DevIssueCategory)}>
            <option value="bug">{devIssueCategoryLabels.bug}</option>
            <option value="request">{devIssueCategoryLabels.request}</option>
          </Select>
        </Field>
        <Field label="優先度">
          <Select value={priority} onChange={(e) => setPriority(e.target.value as DevIssuePriority)}>
            <option value="high">{devIssuePriorityLabels.high}</option>
            <option value="medium">{devIssuePriorityLabels.medium}</option>
            <option value="low">{devIssuePriorityLabels.low}</option>
          </Select>
        </Field>
      </div>
      <Field
        label="詳細（修正や不具合の中身）"
        hint="再現手順・発生店舗・希望する動作など、わかる範囲で具体的に記載してください。"
      >
        <Textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={8}
          placeholder={"例:\n・7/3の継続決済が会計処理できない\n・対象: 千葉院\n・エラー画面のスクリーンショットあり"}
        />
      </Field>

      {/* スクリーンショット添付(ドラッグ&ドロップ / 選択 / 貼り付け) */}
      <Field
        label="スクリーンショット（任意）"
        hint="エラー画面などを添付できます。ドラッグ&ドロップ、この画面で Ctrl+V（⌘+V）貼り付けも可能。✏️で画像に書き込みできます。"
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
          multiple
          className="hidden"
          onChange={(e) => {
            void addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <div
          {...dropProps}
          className={cn(
            "relative flex flex-wrap items-start gap-3 rounded-md p-2 transition-colors",
            dragging
              ? "bg-primary/[0.06] ring-2 ring-inset ring-primary/50"
              : "ring-1 ring-inset ring-transparent",
          )}
        >
          {dragging && (
            <div className="pointer-events-none absolute inset-1 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-primary bg-card/85">
              <span className="text-sm font-medium text-primary">
                ここにドロップして画像を追加
              </span>
            </div>
          )}
          {images.map((img, i) => (
            <div key={i} className="relative w-28">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.dataUrl}
                alt={img.fileName}
                className="aspect-[4/3] w-full rounded-md border border-border object-cover"
              />
              <div className="absolute -right-2 -top-2 flex gap-1">
                <button
                  type="button"
                  title="書き込み"
                  aria-label={`${img.fileName} に書き込み`}
                  onClick={() => setAnnotateIndex(i)}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow hover:text-foreground"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  title="削除"
                  aria-label={`${img.fileName} を削除`}
                  onClick={() => setImages((list) => list.filter((_, j) => j !== i))}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <p className="mt-1 truncate text-[10px] text-muted-foreground">{img.fileName}</p>
            </div>
          ))}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex aspect-[4/3] w-28 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            <ImagePlus className="h-5 w-5" />
            <span className="text-[11px]">画像を追加</span>
          </button>
        </div>
      </Field>

      {category === "request" && (
        <p className="rounded-md bg-secondary px-3 py-2.5 text-xs text-secondary-foreground">
          要望は、プロダクト管理者2名の承諾で「実行」になります（どちらか1名が停止した場合は「実行なし」）。
          登録後の詳細画面から、理想のUIを伝える<span className="font-medium">画像モックのAI生成</span>もできます。
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "登録中…" : "依頼を登録"}
        </Button>
      </div>

      {annotateIndex !== null && images[annotateIndex] && (
        <ImageAnnotator
          imageUrl={images[annotateIndex].dataUrl}
          title={`${images[annotateIndex].fileName} に書き込み`}
          onSave={(png) => {
            setImages((list) =>
              list.map((img, j) =>
                j === annotateIndex
                  ? {
                      dataUrl: png,
                      contentType: "image/png",
                      fileName: annotatedFileName(img.fileName),
                    }
                  : img,
              ),
            );
            setAnnotateIndex(null);
          }}
          onClose={() => setAnnotateIndex(null)}
        />
      )}
    </form>
  );
}
