// Byte helpers that work on Hermes (no Buffer, no reliance on TextEncoder/atob).

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64URL_LOOKUP: Readonly<Record<string, number>> = Object.fromEntries(
  [...B64URL].map((ch, i) => [ch, i]),
);

/** RFC 4648 §5 base64url without padding. */
export function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;
    out += B64URL[(triple >> 18) & 63] + B64URL[(triple >> 12) & 63];
    if (i + 1 < bytes.length) out += B64URL[(triple >> 6) & 63];
    if (i + 2 < bytes.length) out += B64URL[triple & 63];
  }
  return out;
}

/**
 * Strict base64url decode. Accepts standard-alphabet `+`/`/` and trailing `=`
 * padding for leniency, rejects everything else. Returns null on bad input.
 */
export function fromBase64Url(text: string): Uint8Array | null {
  const clean = text.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  if (clean.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const chunk = clean.slice(i, i + 4);
    const vals = [...chunk].map((ch) => B64URL_LOOKUP[ch]);
    if (vals.some((v) => v === undefined)) return null;
    const [v0, v1, v2 = 0, v3 = 0] = vals as number[];
    const triple = (v0 << 18) | (v1 << 12) | (v2 << 6) | v3;
    out[o++] = (triple >> 16) & 0xff;
    if (chunk.length > 2) out[o++] = (triple >> 8) & 0xff;
    if (chunk.length > 3) out[o++] = triple & 0xff;
  }
  return out;
}

export function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((offset, p) => {
    out.set(p, offset);
    return offset + p.length;
  }, 0);
  return out;
}

/** UTF-8 encode. Implemented by hand so domain code has no platform dependency. */
export function utf8Encode(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 63),
        0x80 | ((cp >> 6) & 63),
        0x80 | (cp & 63),
      );
  }
  return Uint8Array.from(out);
}

/** UTF-8 decode. Returns null on malformed input rather than inserting U+FFFD. */
export function utf8Decode(bytes: Uint8Array): string | null {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i];
    const [len, init] =
      b0 < 0x80 ? [1, b0] : b0 >> 5 === 6 ? [2, b0 & 31] : b0 >> 4 === 14 ? [3, b0 & 15] : b0 >> 3 === 30 ? [4, b0 & 7] : [0, 0];
    if (len === 0 || i + len > bytes.length) return null;
    let cp = init;
    for (let k = 1; k < len; k++) {
      const b = bytes[i + k];
      if (b >> 6 !== 2) return null;
      cp = (cp << 6) | (b & 63);
    }
    const minForLen = [0, 0, 0x80, 0x800, 0x10000][len];
    if (cp < minForLen || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return null;
    out += String.fromCodePoint(cp);
    i += len;
  }
  return out;
}

export function writeUint32BE(value: number): Uint8Array {
  return Uint8Array.of((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

export function readUint32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
