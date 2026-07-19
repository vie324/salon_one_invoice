import type { Contract } from "@/lib/domain/types";

/**
 * 契約内容の固定化(ハッシュ)と署名トークン生成。
 *
 * - 送付時に契約内容の正規化JSONを SHA-256 でハッシュ化して保存し、
 *   署名時に再計算・照合することで「署名対象の内容が改変されていないこと」を
 *   技術的に担保する(電子署名法上の非改変性の証跡)。
 * - JSONB(Postgres) はキー順を保持しないため、キーを再帰的にソートする
 *   正規化(stableStringify)を通してから ハッシュを計算する。
 * - 依存を増やさないため SHA-256 は同期実装(FIPS 180-4 準拠)を同梱する。
 *   デモ(インメモリ)のシード生成など同期文脈でも利用できる。
 */

/* ---------------- SHA-256 (同期・依存なし) ---------------- */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

/** UTF-8 文字列の SHA-256 を 64桁hex で返す(同期) */
export function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLen = bytes.length * 8;
  // パディング: 0x80 + 0x00... + 64bit長(ビッグエンディアン)
  const padded = new Uint8Array((((bytes.length + 8) >> 6) + 1) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000));
  dv.setUint32(padded.length - 4, bitLen >>> 0);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  return [...h].map((x) => x.toString(16).padStart(8, "0")).join("");
}

/* ---------------- 正規化 JSON ---------------- */

/** キーを再帰的にソートした決定的 JSON 文字列(JSONB往復後も同一になる) */
export function stableStringify(value: unknown): string {
  if (value === undefined) return "null"; // 配列内の undefined は JSON.stringify と同様 null 扱い
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  // undefined 値のキーは JSON.stringify / JSONB 往復と同様に落とす
  // (落とさないと DB 保存後の再計算でハッシュが一致しなくなる)
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  const body = keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",");
  return `{${body}}`;
}

/**
 * ハッシュ対象となる契約内容の正規化ペイロード。
 * 署名の対象 = 「誰と誰が・何に・いくらで合意したか」を構成する全フィールド。
 */
export function contractCanonicalPayload(
  c: Pick<
    Contract,
    | "contractNumber"
    | "title"
    | "preamble"
    | "provider"
    | "customerParty"
    | "sections"
    | "feeTables"
    | "terms"
  >,
): string {
  return stableStringify({
    contractNumber: c.contractNumber,
    title: c.title,
    preamble: c.preamble,
    provider: c.provider,
    customer: c.customerParty,
    sections: c.sections,
    feeTables: c.feeTables,
    terms: c.terms,
  });
}

/** 契約内容の SHA-256 ハッシュ(64桁hex) */
export function computeContractHash(
  c: Parameters<typeof contractCanonicalPayload>[0],
): string {
  return sha256Hex(contractCanonicalPayload(c));
}

/* ---------------- トークン / アクセスコード ---------------- */

/** 署名URL用トークン(暗号乱数 24バイト = 48hex) */
export function generateSignToken(): string {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 6桁アクセスコード(暗号乱数・先頭0許容) */
export function generateAccessCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1000000).padStart(6, "0");
}
