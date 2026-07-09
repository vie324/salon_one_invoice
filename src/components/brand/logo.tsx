import * as React from "react";
import { cn } from "@/lib/utils";

/** SalonOne ブランドカラー */
export const BRAND = {
  teal: "#0d3b33",
  tealBright: "#0f9b86",
  gold: "#c2a15c",
  cream: "#eef2ef",
};

/** S1 サークルマーク（ゴールドのリング + セリフ体の S / 1） */
export function LogoMark({
  size = 40,
  onDark = false,
  className,
}: {
  size?: number;
  onDark?: boolean;
  className?: string;
}) {
  const sColor = onDark ? BRAND.cream : BRAND.teal;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="SalonOne"
    >
      {/* ゴールドの開いたリング */}
      <circle
        cx="50"
        cy="49"
        r="41"
        fill="none"
        stroke={BRAND.gold}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeDasharray="222 36"
        transform="rotate(118 50 49)"
      />
      {/* セリフ体の S と 1 */}
      <text
        x="45"
        y="72"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="66"
        fontWeight="600"
        fill={sColor}
      >
        S
      </text>
      <text
        x="70"
        y="70"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="52"
        fontWeight="500"
        fill={BRAND.gold}
      >
        1
      </text>
    </svg>
  );
}

/** 横並びロゴ（マーク + SalonOne） */
export function Logo({
  onDark = false,
  showTagline = false,
  markSize = 40,
  className,
}: {
  onDark?: boolean;
  showTagline?: boolean;
  markSize?: number;
  className?: string;
}) {
  const text = onDark ? BRAND.cream : BRAND.teal;
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark size={markSize} onDark={onDark} />
      <div className="leading-none">
        <div
          className="font-serif tracking-tight"
          style={{ color: text, fontSize: markSize * 0.5, fontWeight: 500 }}
        >
          SalonOne
        </div>
        {showTagline && (
          <div
            className="font-serif"
            style={{ color: BRAND.gold, fontSize: markSize * 0.2, marginTop: 2 }}
          >
            One Platform. One Management.
          </div>
        )}
      </div>
    </div>
  );
}

/** 縦積みロゴ（ログイン画面などの大きい表示用） */
export function LogoStacked({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col items-center text-center", className)}>
      <LogoMark size={72} />
      <div className="mt-3 font-serif text-3xl font-medium tracking-tight" style={{ color: BRAND.teal }}>
        SalonOne
      </div>
      <div className="mt-1 font-serif text-sm" style={{ color: BRAND.gold }}>
        One Platform. One Management.
      </div>
    </div>
  );
}
