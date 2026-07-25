/**
 * AIモック生成 — 理想のUIを伝えるためのワイヤーフレーム。
 *
 * トークン消費を抑えるため、HTML ではなく「軽量なレイアウト定義(JSON)」だけを
 * Claude に生成させ、画像(PNG)への描画はブラウザ側で行う。
 * 1回の生成は数百〜千数百トークン程度で、フルHTML生成の数分の一に収まる。
 *
 * 既存アダプタ(メール/決済)と同じく SDK 非依存の REST 直叩き。
 */

import { anthropicApiKey, anthropicModel, isDemoMode } from "@/lib/config";

/** ワイヤーフレームの要素(横並び row の子は入れ子不可) */
export interface MockChildElement {
  type:
    | "heading"
    | "text"
    | "button"
    | "input"
    | "select"
    | "card"
    | "image"
    | "badge";
  label?: string;
  text?: string;
  primary?: boolean;
}

export interface MockElement {
  type:
    | "navbar"
    | "heading"
    | "text"
    | "button"
    | "input"
    | "select"
    | "table"
    | "card"
    | "list"
    | "image"
    | "badge"
    | "divider"
    | "row";
  label?: string;
  text?: string;
  items?: string[];
  columns?: string[];
  rows?: number;
  primary?: boolean;
  children?: MockChildElement[];
}

export interface UiMockSpec {
  /** 画面タイトル(ファイル名にも使用) */
  title: string;
  device: "mobile" | "desktop";
  elements: MockElement[];
}

/** 構造化出力(JSON Schema)。再帰なし・additionalProperties: false 準拠 */
const CHILD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["type"],
  properties: {
    type: {
      type: "string",
      enum: ["heading", "text", "button", "input", "select", "card", "image", "badge"],
    },
    label: { type: "string" },
    text: { type: "string" },
    primary: { type: "boolean" },
  },
} as const;

const MOCK_SPEC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "device", "elements"],
  properties: {
    title: { type: "string", description: "画面タイトル(日本語・20文字以内)" },
    device: { type: "string", enum: ["mobile", "desktop"] },
    elements: {
      type: "array",
      description: "上から順に縦に並ぶ画面要素(6〜14個)",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type"],
        properties: {
          type: {
            type: "string",
            enum: [
              "navbar",
              "heading",
              "text",
              "button",
              "input",
              "select",
              "table",
              "card",
              "list",
              "image",
              "badge",
              "divider",
              "row",
            ],
          },
          label: { type: "string", description: "見出し/ボタン/入力欄などのラベル" },
          text: { type: "string", description: "text/card の本文(短く)" },
          items: { type: "array", items: { type: "string" }, description: "navbar/list の項目" },
          columns: { type: "array", items: { type: "string" }, description: "table の列名" },
          rows: { type: "integer", description: "table のダミー行数(1〜5)" },
          primary: { type: "boolean", description: "button を強調色にする" },
          children: {
            type: "array",
            items: CHILD_SCHEMA,
            description: "row の子要素(横並び・最大4個)",
          },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = [
  "あなたはサロン向け管理システム「Salon One」のUI設計者です。",
  "依頼内容から、その機能の理想の画面ワイヤーフレームを1画面だけ設計し、指定のJSONスキーマに従って出力します。",
  "ルール:",
  "- テキストはすべて日本語で短く(ラベルは10文字以内、本文は60文字以内)。",
  "- 要素は6〜14個。最初は navbar、次に heading が基本。",
  "- 一覧系は table、金額や残高は card、操作は button(主要操作は primary)。",
  "- 横に並べたい要素だけ row の children にまとめる(最大4個・入れ子不可)。",
  "- 装飾の説明や補足は書かない。JSONのみ。",
].join("\n");

/** 生成結果の安全化(描画が壊れないよう件数・文字数を丸める) */
export function sanitizeMockSpec(raw: UiMockSpec): UiMockSpec {
  const trim = (s: unknown, max: number) =>
    typeof s === "string" ? s.slice(0, max) : undefined;
  const clampChild = (c: MockChildElement): MockChildElement => ({
    type: c.type,
    label: trim(c.label, 24),
    text: trim(c.text, 80),
    primary: !!c.primary,
  });
  const elements = (raw.elements ?? [])
    .slice(0, 16)
    .filter((e) => e && typeof e.type === "string")
    .map((e): MockElement => ({
      type: e.type,
      label: trim(e.label, 40),
      text: trim(e.text, 160),
      items: Array.isArray(e.items) ? e.items.slice(0, 6).map((s) => String(s).slice(0, 12)) : undefined,
      columns: Array.isArray(e.columns)
        ? e.columns.slice(0, 6).map((s) => String(s).slice(0, 10))
        : undefined,
      rows: Math.min(5, Math.max(1, Math.round(Number(e.rows) || 3))),
      primary: !!e.primary,
      children: Array.isArray(e.children) ? e.children.slice(0, 4).map(clampChild) : undefined,
    }));
  return {
    title: trim(raw.title, 24) || "画面モック",
    device: raw.device === "desktop" ? "desktop" : "mobile",
    elements: elements.length > 0 ? elements : buildSampleMockSpec("画面モック", raw.device).elements,
  };
}

/** APIキーなし(デモ等)でフローを確認するためのサンプル生成 */
export function buildSampleMockSpec(
  description: string,
  device: "mobile" | "desktop" = "mobile",
): UiMockSpec {
  const firstLine = description.split(/\n/)[0]?.trim() ?? "";
  const title = (firstLine || "画面モック").slice(0, 18);
  return {
    title,
    device,
    elements: [
      { type: "navbar", label: "SalonOne", items: ["ホーム", "予約", "売上", "設定"] },
      { type: "heading", label: title },
      { type: "text", text: description.slice(0, 60) || "依頼内容の概要がここに入ります。" },
      {
        type: "row",
        children: [
          { type: "button", label: "新規作成", primary: true },
          { type: "button", label: "CSV出力" },
        ],
      },
      { type: "input", label: "検索" },
      { type: "table", columns: ["日付", "項目", "金額"], rows: 3 },
      { type: "card", label: "残高", text: "¥12,000" },
    ],
  };
}

/**
 * ワイヤーフレーム定義を生成する。
 * APIキー未設定: デモモードはサンプルを返し、本番は設定を促すエラー。
 */
export async function generateMockSpec(
  description: string,
  device: "mobile" | "desktop",
): Promise<{ spec: UiMockSpec; sample: boolean }> {
  if (!anthropicApiKey) {
    if (isDemoMode) {
      return { spec: buildSampleMockSpec(description, device), sample: true };
    }
    throw new Error(
      "AIモック生成には ANTHROPIC_API_KEY の設定が必要です(Vercel の環境変数に追加してください)",
    );
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-api-key": anthropicApiKey,
    "anthropic-version": "2023-06-01",
  };
  const body: Record<string, unknown> = {
    model: anthropicModel,
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `端末: ${device === "desktop" ? "PC(横長)" : "スマホ(縦長)"}\n依頼内容:\n${description.slice(0, 2000)}`,
      },
    ],
    // 小さなJSON出力のため思考は浅くしてトークン消費を抑える
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: MOCK_SPEC_SCHEMA },
    },
  };
  // 安全分類による拒否時は推奨フォールバックモデルで自動再実行(対応モデルのみ)
  if (/^claude-(opus-5|fable-5)/.test(anthropicModel)) {
    headers["anthropic-beta"] = "server-side-fallback-2026-07-01";
    body.fallbacks = "default";
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      message = err?.error?.message ?? message;
    } catch {
      /* ignore */
    }
    throw new Error(`AIモックの生成に失敗しました: ${message}`);
  }
  const data = await res.json();
  if (data.stop_reason === "refusal") {
    throw new Error("この内容ではモックを生成できませんでした。表現を変えてお試しください");
  }
  const text = (data.content ?? []).find(
    (b: { type: string }) => b.type === "text",
  )?.text;
  if (!text) throw new Error("AIモックの生成結果が空でした。もう一度お試しください");
  let parsed: UiMockSpec;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("AIモックの生成結果を読み取れませんでした。もう一度お試しください");
  }
  return { spec: sanitizeMockSpec(parsed), sample: false };
}
