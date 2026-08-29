import { ImageResponse } from "next/og";
import { BRAND } from "@/components/brand/logo";

/**
 * iOS の「ホーム画面に追加」で使われるアイコン(apple-touch-icon)。
 * SVG は iOS が読まないため、ブランドカラーの PNG をビルド時に生成する。
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BRAND.teal,
          color: BRAND.cream,
          fontSize: 96,
          fontWeight: 600,
          letterSpacing: -2,
        }}
      >
        <span>S</span>
        <span style={{ color: BRAND.gold, fontSize: 72 }}>1</span>
      </div>
    ),
    size,
  );
}
