"use client";

import {
  ArrowUpRight,
  Pencil,
  RotateCcw,
  Square,
  Trash2,
  Type,
} from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Tool = "pen" | "arrow" | "rect" | "text";

type Annotation =
  | { type: "pen"; color: string; width: number; points: number[] }
  | { type: "arrow"; color: string; width: number; x1: number; y1: number; x2: number; y2: number }
  | { type: "rect"; color: string; width: number; x: number; y: number; w: number; h: number }
  | { type: "text"; color: string; size: number; x: number; y: number; text: string };

const COLORS = ["#e11d48", "#2563eb", "#f59e0b", "#16a34a", "#111111", "#ffffff"];

/**
 * スクリーンショットへの書き込みエディタ。
 * ペン・矢印・枠・テキストを重ねて PNG として保存する(元画像は変更しない)。
 */
export function ImageAnnotator({
  imageUrl,
  title,
  saving,
  onSave,
  onClose,
}: {
  imageUrl: string;
  title?: string;
  saving?: boolean;
  onSave: (pngDataUrl: string) => void;
  onClose: () => void;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const imgRef = React.useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [tool, setTool] = React.useState<Tool>("pen");
  const [color, setColor] = React.useState(COLORS[0]);
  const [annotations, setAnnotations] = React.useState<Annotation[]>([]);
  const [draft, setDraft] = React.useState<Annotation | null>(null);
  const [pendingText, setPendingText] = React.useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = React.useState("");

  // 画像を読み込んでキャンバスサイズを決定(署名付きURLは CORS 経由で取得)
  React.useEffect(() => {
    let cancelled = false;
    const img = new Image();
    if (!imageUrl.startsWith("data:")) img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
      }
      setReady(true);
    };
    img.onerror = () => !cancelled && setError("画像を読み込めませんでした");
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  const strokeWidth = () => Math.max(3, Math.round((canvasRef.current?.width ?? 900) / 250));
  const fontSize = () => Math.max(18, Math.round((canvasRef.current?.width ?? 900) / 36));

  // 再描画
  const redraw = React.useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const a of [...annotations, ...(draft ? [draft] : [])]) {
      drawAnnotation(ctx, a);
    }
  }, [annotations, draft]);

  React.useEffect(() => {
    if (ready) redraw();
  }, [ready, redraw]);

  const toCanvasPoint = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!ready || pendingText) return;
    const { x, y } = toCanvasPoint(e);
    if (tool === "text") {
      // pointerdown のデフォルト(フォーカス移動)が直後に出す入力欄の
      // フォーカスを奪い、blur で即閉じてしまうのを防ぐ
      e.preventDefault();
      setPendingText({ x, y });
      setTextValue("");
      return;
    }
    (e.target as Element).setPointerCapture(e.pointerId);
    const w = strokeWidth();
    if (tool === "pen") setDraft({ type: "pen", color, width: w, points: [x, y] });
    if (tool === "arrow") setDraft({ type: "arrow", color, width: w, x1: x, y1: y, x2: x, y2: y });
    if (tool === "rect") setDraft({ type: "rect", color, width: w, x, y, w: 0, h: 0 });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draft) return;
    const { x, y } = toCanvasPoint(e);
    setDraft((d) => {
      if (!d) return d;
      if (d.type === "pen") return { ...d, points: [...d.points, x, y] };
      if (d.type === "arrow") return { ...d, x2: x, y2: y };
      if (d.type === "rect") return { ...d, w: x - d.x, h: y - d.y };
      return d;
    });
  };

  const onPointerUp = () => {
    if (!draft) return;
    setAnnotations((list) => [...list, draft]);
    setDraft(null);
  };

  const commitText = () => {
    if (pendingText && textValue.trim()) {
      setAnnotations((list) => [
        ...list,
        { type: "text", color, size: fontSize(), x: pendingText.x, y: pendingText.y, text: textValue.trim() },
      ]);
    }
    setPendingText(null);
    setTextValue("");
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      onSave(canvas.toDataURL("image/png"));
    } catch {
      setError("画像の書き出しに失敗しました(画像の取得元がCORSに対応していません)");
    }
  };

  const toolBtn = (t: Tool, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => setTool(t)}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors",
        tool === t
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {icon}
    </button>
  );

  return (
    <Dialog
      open
      onClose={onClose}
      title={title ?? "画像に書き込み"}
      description="ペン・矢印・枠・テキストで注釈を入れ、新しい画像として保存します。"
      className="sm:max-w-4xl"
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {toolBtn("pen", <Pencil className="h-4 w-4" />, "ペン")}
          {toolBtn("arrow", <ArrowUpRight className="h-4 w-4" />, "矢印")}
          {toolBtn("rect", <Square className="h-4 w-4" />, "枠")}
          {toolBtn("text", <Type className="h-4 w-4" />, "テキスト")}
          <span className="mx-1 h-5 w-px bg-border" />
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`色 ${c}`}
              className={cn(
                "h-7 w-7 rounded-full border-2",
                color === c ? "border-primary" : "border-border",
              )}
              style={{ backgroundColor: c }}
            />
          ))}
          <span className="mx-1 h-5 w-px bg-border" />
          <button
            type="button"
            onClick={() => setAnnotations((l) => l.slice(0, -1))}
            disabled={annotations.length === 0}
            title="元に戻す"
            aria-label="元に戻す"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setAnnotations([])}
            disabled={annotations.length === 0}
            title="すべて消す"
            aria-label="すべて消す"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <div className="relative overflow-auto rounded-md border border-border bg-muted/30">
          {!ready && !error && (
            <p className="p-8 text-center text-sm text-muted-foreground">画像を読み込み中…</p>
          )}
          {error && <p className="p-8 text-center text-sm text-destructive">{error}</p>}
          <canvas
            ref={canvasRef}
            className={cn("block max-h-[60vh] w-full touch-none select-none object-contain", !ready && "hidden")}
            style={{ cursor: tool === "text" ? "text" : "crosshair" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
          {/* テキスト入力(クリック位置に重ねる) */}
          {pendingText && canvasRef.current && (
            <input
              autoFocus
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onBlur={commitText}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitText();
                if (e.key === "Escape") {
                  setPendingText(null);
                  setTextValue("");
                }
              }}
              placeholder="テキストを入力してEnter"
              className="absolute z-10 rounded border border-primary bg-card px-2 py-1 text-sm shadow"
              style={{
                left: `${(pendingText.x / canvasRef.current.width) * 100}%`,
                top: `${(pendingText.y / canvasRef.current.height) * 100}%`,
              }}
            />
          )}
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            キャンセル
          </Button>
          <Button type="button" onClick={save} disabled={!ready || !!saving}>
            {saving ? "保存中…" : "書き込みを保存"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function drawAnnotation(ctx: CanvasRenderingContext2D, a: Annotation) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (a.type === "pen") {
    ctx.strokeStyle = a.color;
    ctx.lineWidth = a.width;
    ctx.beginPath();
    for (let i = 0; i < a.points.length; i += 2) {
      const x = a.points[i];
      const y = a.points[i + 1];
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  } else if (a.type === "arrow") {
    ctx.strokeStyle = a.color;
    ctx.fillStyle = a.color;
    ctx.lineWidth = a.width;
    ctx.beginPath();
    ctx.moveTo(a.x1, a.y1);
    ctx.lineTo(a.x2, a.y2);
    ctx.stroke();
    // 矢じり
    const angle = Math.atan2(a.y2 - a.y1, a.x2 - a.x1);
    const size = a.width * 4;
    ctx.beginPath();
    ctx.moveTo(a.x2, a.y2);
    ctx.lineTo(a.x2 - size * Math.cos(angle - Math.PI / 6), a.y2 - size * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(a.x2 - size * Math.cos(angle + Math.PI / 6), a.y2 - size * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  } else if (a.type === "rect") {
    ctx.strokeStyle = a.color;
    ctx.lineWidth = a.width;
    ctx.strokeRect(Math.min(a.x, a.x + a.w), Math.min(a.y, a.y + a.h), Math.abs(a.w), Math.abs(a.h));
  } else if (a.type === "text") {
    ctx.font = `bold ${a.size}px sans-serif`;
    ctx.textBaseline = "top";
    // 白フチで視認性を確保
    ctx.lineWidth = Math.max(3, a.size / 6);
    ctx.strokeStyle = a.color === "#ffffff" ? "#111111" : "#ffffff";
    ctx.strokeText(a.text, a.x, a.y);
    ctx.fillStyle = a.color;
    ctx.fillText(a.text, a.x, a.y);
  }
  ctx.restore();
}
