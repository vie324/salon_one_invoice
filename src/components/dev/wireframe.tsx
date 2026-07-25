"use client";

import * as React from "react";
import type { MockChildElement, MockElement, UiMockSpec } from "@/lib/ai/mock";

/**
 * ワイヤーフレーム描画(SVG)。
 * AIが返す軽量なレイアウト定義を、その場でモック画像として描画する。
 * PNG 化は svgToPngDataUrl(lib/images) で行う。
 */

const C = {
  bg: "#ffffff",
  chrome: "#f1f5f9",
  border: "#cbd5e1",
  box: "#f8fafc",
  boxDark: "#e2e8f0",
  text: "#334155",
  muted: "#94a3b8",
  primary: "#0f766e",
  primaryText: "#ffffff",
  badgeBg: "#fef3c7",
  badgeText: "#92400e",
} as const;

const PAD = 20;
const GAP = 14;
const CHROME_H = 40;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 日本語前提の簡易折り返し(等幅換算) */
function wrapText(text: string, maxChars: number, maxLines = 3): string[] {
  const lines: string[] = [];
  let rest = text.replace(/\s+/g, " ").trim();
  while (rest.length > 0 && lines.length < maxLines) {
    lines.push(rest.slice(0, maxChars));
    rest = rest.slice(maxChars);
  }
  if (rest.length > 0 && lines.length > 0) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, maxChars - 1) + "…";
  }
  return lines;
}

function elementHeight(el: MockElement | MockChildElement, w: number): number {
  const charsPerLine = Math.max(8, Math.floor(w / 15));
  switch (el.type) {
    case "navbar":
      return 48;
    case "heading":
      return 34;
    case "text":
      return wrapText(el.text ?? el.label ?? "", charsPerLine).length * 22 + 6;
    case "button":
      return 42;
    case "input":
    case "select":
      return 62;
    case "table": {
      const rows = Math.min(5, Math.max(1, (el as MockElement).rows ?? 3));
      return 34 + rows * 32;
    }
    case "card": {
      const bodyLines = wrapText(el.text ?? "", charsPerLine - 2, 2).length;
      return 20 + 20 + bodyLines * 20 + 14;
    }
    case "list": {
      const items = (el as MockElement).items?.length ?? 3;
      return Math.max(1, Math.min(6, items)) * 34;
    }
    case "image":
      return w > 600 ? 180 : 130;
    case "badge":
      return 26;
    case "divider":
      return 12;
    case "row": {
      const children = (el as MockElement).children ?? [];
      if (children.length === 0) return 42;
      const cw = (w - GAP * (children.length - 1)) / children.length;
      return Math.max(...children.map((c) => elementHeight(c, cw)));
    }
  }
}

function ElementSvg({ el, box }: { el: MockElement | MockChildElement; box: Box }) {
  const { x, y, w, h } = box;
  const charsPerLine = Math.max(8, Math.floor(w / 15));
  switch (el.type) {
    case "navbar": {
      const items = (el as MockElement).items ?? [];
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={8} fill={C.primary} />
          <circle cx={x + 22} cy={y + h / 2} r={9} fill="#ffffff" opacity={0.9} />
          <text x={x + 40} y={y + h / 2 + 5} fontSize={15} fontWeight={700} fill={C.primaryText}>
            {el.label ?? "SalonOne"}
          </text>
          {items.slice(0, 4).map((item, i) => (
            <text
              key={i}
              x={x + w - 14 - (items.length - 1 - i) * 74}
              y={y + h / 2 + 5}
              fontSize={13}
              fill={C.primaryText}
              opacity={0.92}
              textAnchor="end"
            >
              {item}
            </text>
          ))}
        </g>
      );
    }
    case "heading":
      return (
        <g>
          <text x={x} y={y + 24} fontSize={21} fontWeight={700} fill={C.text}>
            {wrapText(el.label ?? el.text ?? "見出し", Math.max(6, Math.floor(w / 22)), 1)[0]}
          </text>
          <rect x={x} y={y + h - 2} width={56} height={3} rx={1.5} fill={C.primary} />
        </g>
      );
    case "text":
      return (
        <g>
          {wrapText(el.text ?? el.label ?? "", charsPerLine).map((line, i) => (
            <text key={i} x={x} y={y + 16 + i * 22} fontSize={14} fill={C.text}>
              {line}
            </text>
          ))}
        </g>
      );
    case "button": {
      const primary = !!el.primary;
      return (
        <g>
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            rx={8}
            fill={primary ? C.primary : C.bg}
            stroke={primary ? C.primary : C.border}
            strokeWidth={1.5}
          />
          <text
            x={x + w / 2}
            y={y + h / 2 + 5}
            fontSize={14}
            fontWeight={600}
            textAnchor="middle"
            fill={primary ? C.primaryText : C.text}
          >
            {el.label ?? "ボタン"}
          </text>
        </g>
      );
    }
    case "input":
    case "select":
      return (
        <g>
          <text x={x} y={y + 13} fontSize={12} fill={C.muted}>
            {el.label ?? (el.type === "select" ? "選択" : "入力")}
          </text>
          <rect x={x} y={y + 20} width={w} height={40} rx={8} fill={C.bg} stroke={C.border} strokeWidth={1.5} />
          {el.type === "select" ? (
            <path
              d={`M ${x + w - 26} ${y + 36} l 7 8 l 7 -8`}
              stroke={C.muted}
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
            />
          ) : (
            <text x={x + 12} y={y + 45} fontSize={13} fill={C.muted}>
              {(el as MockChildElement).text ?? ""}
            </text>
          )}
        </g>
      );
    case "table": {
      const cols = ((el as MockElement).columns?.length ? (el as MockElement).columns : ["項目", "内容", "値"])!;
      const rows = Math.min(5, Math.max(1, (el as MockElement).rows ?? 3));
      const colW = w / cols.length;
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={8} fill={C.bg} stroke={C.border} strokeWidth={1.5} />
          <rect x={x} y={y} width={w} height={34} rx={8} fill={C.boxDark} />
          <rect x={x} y={y + 20} width={w} height={14} fill={C.boxDark} />
          {cols.map((c, i) => (
            <text key={i} x={x + colW * i + 12} y={y + 22} fontSize={12.5} fontWeight={700} fill={C.text}>
              {c}
            </text>
          ))}
          {Array.from({ length: rows }).map((_, r) => (
            <g key={r}>
              <line
                x1={x}
                y1={y + 34 + r * 32}
                x2={x + w}
                y2={y + 34 + r * 32}
                stroke={C.border}
                strokeWidth={r === 0 ? 0 : 1}
              />
              {cols.map((_, ci) => (
                <rect
                  key={ci}
                  x={x + colW * ci + 12}
                  y={y + 34 + r * 32 + 11}
                  width={Math.max(24, colW * (ci === 0 ? 0.62 : 0.5))}
                  height={9}
                  rx={4.5}
                  fill={C.boxDark}
                />
              ))}
            </g>
          ))}
        </g>
      );
    }
    case "card": {
      const bodyLines = wrapText(el.text ?? "", charsPerLine - 2, 2);
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={10} fill={C.box} stroke={C.border} strokeWidth={1.5} />
          <text x={x + 14} y={y + 24} fontSize={12.5} fill={C.muted}>
            {el.label ?? "カード"}
          </text>
          {bodyLines.length > 0 ? (
            bodyLines.map((line, i) => (
              <text key={i} x={x + 14} y={y + 46 + i * 20} fontSize={16} fontWeight={700} fill={C.text}>
                {line}
              </text>
            ))
          ) : (
            <rect x={x + 14} y={y + 36} width={w * 0.4} height={12} rx={6} fill={C.boxDark} />
          )}
        </g>
      );
    }
    case "list": {
      const items = ((el as MockElement).items?.length ? (el as MockElement).items : ["項目 1", "項目 2", "項目 3"])!;
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={8} fill={C.bg} stroke={C.border} strokeWidth={1.5} />
          {items.slice(0, 6).map((item, i) => (
            <g key={i}>
              {i > 0 && (
                <line x1={x} y1={y + i * 34} x2={x + w} y2={y + i * 34} stroke={C.border} strokeWidth={1} />
              )}
              <circle cx={x + 18} cy={y + i * 34 + 17} r={4} fill={C.primary} opacity={0.55} />
              <text x={x + 34} y={y + i * 34 + 22} fontSize={13.5} fill={C.text}>
                {item}
              </text>
            </g>
          ))}
        </g>
      );
    }
    case "image":
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={10} fill={C.box} stroke={C.border} strokeWidth={1.5} />
          <line x1={x + 14} y1={y + h - 14} x2={x + w * 0.42} y2={y + h * 0.38} stroke={C.border} strokeWidth={2} />
          <line x1={x + w * 0.42} y1={y + h * 0.38} x2={x + w * 0.62} y2={y + h * 0.66} stroke={C.border} strokeWidth={2} />
          <line x1={x + w * 0.62} y1={y + h * 0.66} x2={x + w - 14} y2={y + 22} stroke={C.border} strokeWidth={2} />
          <circle cx={x + w * 0.78} cy={y + h * 0.32} r={10} fill={C.boxDark} />
          {el.label && (
            <text x={x + w / 2} y={y + h / 2 + 5} fontSize={13} textAnchor="middle" fill={C.muted}>
              {el.label}
            </text>
          )}
        </g>
      );
    case "badge": {
      const label = el.label ?? "バッジ";
      const bw = Math.min(w, label.length * 14 + 26);
      return (
        <g>
          <rect x={x} y={y} width={bw} height={26} rx={13} fill={C.badgeBg} />
          <text x={x + bw / 2} y={y + 17.5} fontSize={12.5} fontWeight={600} textAnchor="middle" fill={C.badgeText}>
            {label}
          </text>
        </g>
      );
    }
    case "divider":
      return <line x1={x} y1={y + 6} x2={x + w} y2={y + 6} stroke={C.border} strokeWidth={1.5} strokeDasharray="6 5" />;
    case "row": {
      const children = (el as MockElement).children ?? [];
      if (children.length === 0) return null;
      const cw = (w - GAP * (children.length - 1)) / children.length;
      return (
        <g>
          {children.map((c, i) => (
            <ElementSvg key={i} el={c} box={{ x: x + i * (cw + GAP), y, w: cw, h: elementHeight(c, cw) }} />
          ))}
        </g>
      );
    }
  }
}

/** ワイヤーフレーム本体。ref は PNG 書き出し(svgToPngDataUrl)用 */
export const WireframeSvg = React.forwardRef<SVGSVGElement, { spec: UiMockSpec }>(
  function WireframeSvg({ spec }, ref) {
    const width = spec.device === "desktop" ? 1120 : 400;
    const contentW = width - PAD * 2;

    // 位置を先に計算
    const boxes: { el: MockElement; box: Box }[] = [];
    let y = CHROME_H + PAD;
    for (const el of spec.elements) {
      const h = elementHeight(el, contentW);
      boxes.push({ el, box: { x: PAD, y, w: contentW, h } });
      y += h + GAP;
    }
    const height = y - GAP + PAD;

    return (
      <svg
        ref={ref}
        viewBox={`0 0 ${width} ${height}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={`${spec.title} のワイヤーフレーム`}
        style={{ width: "100%", height: "auto", display: "block", background: C.bg }}
        fontFamily="'Hiragino Sans','Noto Sans JP',system-ui,sans-serif"
      >
        <rect x={0} y={0} width={width} height={height} fill={C.bg} stroke={C.border} strokeWidth={2} rx={10} />
        {/* 上部のブラウザ/端末バー */}
        <path d={`M 0 ${CHROME_H} H ${width}`} stroke={C.border} strokeWidth={1.5} />
        <rect x={0} y={0} width={width} height={CHROME_H} fill={C.chrome} rx={10} />
        <rect x={0} y={CHROME_H - 10} width={width} height={10} fill={C.chrome} />
        {spec.device === "desktop" ? (
          <g>
            <circle cx={20} cy={CHROME_H / 2} r={5} fill="#fca5a5" />
            <circle cx={38} cy={CHROME_H / 2} r={5} fill="#fcd34d" />
            <circle cx={56} cy={CHROME_H / 2} r={5} fill="#86efac" />
          </g>
        ) : (
          <rect x={width / 2 - 32} y={CHROME_H / 2 - 4} width={64} height={8} rx={4} fill={C.boxDark} />
        )}
        <text
          x={width / 2}
          y={CHROME_H / 2 + 4.5}
          fontSize={12.5}
          textAnchor="middle"
          fill={C.muted}
          fontWeight={600}
        >
          {spec.device === "desktop" ? spec.title : ""}
        </text>
        {boxes.map(({ el, box }, i) => (
          <ElementSvg key={i} el={el} box={box} />
        ))}
      </svg>
    );
  },
);
