"use client";

/**
 * 画像のクライアント側ユーティリティ。
 * アップロード前の縮小(通信・保存量の削減)と、SVG→PNG 変換(AIモックの画像化)。
 */

/** 添付画像の長辺の上限(px)。スクショの文字が読める範囲で縮小する */
export const MAX_IMAGE_DIMENSION = 1600;

/** 変換後 data URL のサイズ上限(約5MB。サーバー側の制限より小さく) */
const MAX_DATA_URL_LENGTH = 5 * 1024 * 1024;

/** File(画像)を読み込み、必要なら縮小して data URL にする */
export async function fileToProcessedDataUrl(
  file: File,
): Promise<{ dataUrl: string; contentType: string }> {
  if (!/^image\/(png|jpeg|webp|gif|bmp)$/.test(file.type)) {
    throw new Error("画像ファイル(PNG/JPEG/WebP)を選択してください");
  }
  const original = await readFileAsDataUrl(file);
  const img = await loadImage(original);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(img.width, img.height));
  // JPEG は JPEG のまま(写真向き)、それ以外は PNG(スクショの文字が綺麗)
  const contentType = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像の処理に失敗しました");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  let dataUrl = canvas.toDataURL(contentType, 0.88);
  if (dataUrl.length > MAX_DATA_URL_LENGTH && contentType === "image/png") {
    // 大きな PNG は JPEG に落として容量を抑える
    dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    if (dataUrl.length <= MAX_DATA_URL_LENGTH) {
      return { dataUrl, contentType: "image/jpeg" };
    }
  }
  if (dataUrl.length > MAX_DATA_URL_LENGTH) {
    throw new Error("画像が大きすぎます。小さい画像でお試しください");
  }
  return { dataUrl, contentType };
}

/** クリップボード貼り付けから画像ファイルを取り出す */
export function imageFilesFromClipboard(e: ClipboardEvent): File[] {
  const files: File[] = [];
  for (const item of Array.from(e.clipboardData?.items ?? [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const f = item.getAsFile();
      if (f) files.push(f);
    }
  }
  return files;
}

/** SVG 要素を PNG の data URL に変換する(AIモックの画像化に使用) */
export async function svgToPngDataUrl(
  svg: SVGSVGElement,
  opts?: { scale?: number; background?: string },
): Promise<string> {
  const scale = opts?.scale ?? 2;
  const width = svg.viewBox.baseVal?.width || svg.clientWidth;
  const height = svg.viewBox.baseVal?.height || svg.clientHeight;
  const xml = new XMLSerializer().serializeToString(svg);
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  const img = await loadImage(svgUrl);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像の生成に失敗しました");
  ctx.fillStyle = opts?.background ?? "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
    reader.readAsDataURL(file);
  });
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    img.src = src;
  });
}
