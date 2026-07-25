"use client";

import { ImagePlus, Paperclip, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  addDevIssueAttachmentAction,
  deleteDevIssueAttachmentAction,
} from "@/app/actions/dev-issues";
import { ImageAnnotator } from "@/components/dev/image-annotator";
import { MockGeneratorButton } from "@/components/dev/mock-generator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { fileToProcessedDataUrl, imageFilesFromClipboard } from "@/lib/images";
import type { DevIssueAttachment } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/utils";

/**
 * 添付画像パネル(詳細ページ)。
 * ファイル選択・クリップボード貼り付けで追加し、クリックで拡大・書き込み・削除。
 */
export function AttachmentsPanel({
  issueId,
  issueTitle,
  attachments,
  currentUserId,
  isAdmin,
}: {
  issueId: string;
  issueTitle: string;
  attachments: DevIssueAttachment[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [viewer, setViewer] = React.useState<DevIssueAttachment | null>(null);
  const [annotating, setAnnotating] = React.useState<DevIssueAttachment | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<DevIssueAttachment | null>(null);
  const [pending, startTransition] = React.useTransition();

  const upload = async (files: File[]) => {
    if (files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of files) {
        const { dataUrl, contentType } = await fileToProcessedDataUrl(file);
        const res = await addDevIssueAttachmentAction(issueId, {
          fileName: file.name || "screenshot.png",
          contentType,
          dataUrl,
          kind: "screenshot",
        });
        if (!res.ok) throw new Error(res.error);
      }
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  // ページ上でのクリップボード貼り付け(input への貼り付けは除外)
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const files = imageFilesFromClipboard(e);
      if (files.length > 0) {
        e.preventDefault();
        void upload(files);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueId]);

  const saveAnnotated = (source: DevIssueAttachment) => (pngDataUrl: string) => {
    startTransition(async () => {
      setError(null);
      const res = await addDevIssueAttachmentAction(issueId, {
        fileName: annotatedName(source.fileName),
        contentType: "image/png",
        dataUrl: pngDataUrl,
        kind: source.kind,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAnnotating(null);
      setViewer(null);
      router.refresh();
    });
  };

  const remove = (att: DevIssueAttachment) => {
    startTransition(async () => {
      setError(null);
      const res = await deleteDevIssueAttachmentAction(att.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setConfirmDelete(null);
      setViewer(null);
      router.refresh();
    });
  };

  const canDelete = (att: DevIssueAttachment) => isAdmin || att.uploadedById === currentUserId;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="inline-flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-primary" />
          添付画像・モック
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <MockGeneratorButton issueId={issueId} issueTitle={issueTitle} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus className="h-4 w-4" />
            {uploading ? "アップロード中…" : "画像を追加"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
          multiple
          className="hidden"
          onChange={(e) => {
            void upload(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />

        {attachments.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            スクリーンショットを「画像を追加」か、この画面で <kbd className="rounded border border-border bg-muted px-1">Ctrl+V</kbd> 貼り付けで添付できます。
            「AIモック生成」で理想UIの画像モックも作れます。
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {attachments.map((att) => (
              <li key={att.id}>
                <button
                  type="button"
                  onClick={() => setViewer(att)}
                  className="group relative block w-full overflow-hidden rounded-md border border-border bg-muted/30"
                >
                  {/* サムネイル(署名付きURL/データURL) */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={att.url}
                    alt={att.fileName}
                    className="aspect-[4/3] w-full object-cover transition-transform group-hover:scale-[1.03]"
                  />
                  {att.kind === "mock" && (
                    <span className="absolute left-1.5 top-1.5">
                      <Badge tone="primary">モック</Badge>
                    </span>
                  )}
                </button>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  {att.fileName} ・ {att.uploadedByName}
                </p>
              </li>
            ))}
          </ul>
        )}
        {attachments.length > 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            この画面で <kbd className="rounded border border-border bg-muted px-1">Ctrl+V</kbd>（⌘+V）貼り付けでも追加できます。画像クリックで拡大・書き込み・削除。
          </p>
        )}
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

        {/* 拡大ビューア */}
        {viewer && !annotating && (
          <Dialog
            open
            onClose={() => setViewer(null)}
            title={viewer.fileName}
            description={`${viewer.uploadedByName} ・ ${formatDateTime(viewer.createdAt)}`}
            className="sm:max-w-4xl"
          >
            <div className="space-y-3">
              <div className="max-h-[65vh] overflow-auto rounded-md border border-border bg-muted/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={viewer.url} alt={viewer.fileName} className="w-full object-contain" />
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {canDelete(viewer) && (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={pending}
                    onClick={() => setConfirmDelete(viewer)}
                  >
                    <Trash2 className="h-4 w-4" />
                    削除
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAnnotating(viewer)}
                >
                  <Pencil className="h-4 w-4" />
                  書き込みを追加
                </Button>
              </div>
            </div>
          </Dialog>
        )}

        {/* 注釈エディタ(保存すると別画像として追加) */}
        {annotating && (
          <ImageAnnotator
            imageUrl={annotating.url}
            title={`${annotating.fileName} に書き込み`}
            saving={pending}
            onSave={saveAnnotated(annotating)}
            onClose={() => setAnnotating(null)}
          />
        )}

        {/* 削除確認 */}
        {confirmDelete && (
          <Dialog
            open
            onClose={() => setConfirmDelete(null)}
            title="この画像を削除しますか？"
            description={confirmDelete.fileName}
          >
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setConfirmDelete(null)} disabled={pending}>
                キャンセル
              </Button>
              <Button type="button" variant="danger" onClick={() => remove(confirmDelete)} disabled={pending}>
                {pending ? "削除中…" : "削除する"}
              </Button>
            </div>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
}

function annotatedName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}-注釈入り.png`;
}
