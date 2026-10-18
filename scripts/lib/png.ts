import { crc32, deflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const RGB = 2;

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * An opaque RGBA image as an 8-bit RGB PNG: no alpha channel, which App Store
 * Connect refuses in screenshots even when every pixel is opaque. Throws on a
 * pixel that isn't opaque, since dropping its alpha would change how it looks.
 */
export function rgbPng(rgba: Uint8Array, width: number, height: number): Buffer {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`Bad image size ${width}×${height}`);
  }
  if (rgba.length !== width * height * 4) throw new Error(`Expected ${width * height * 4} bytes of RGBA, got ${rgba.length}`);
  const stride = width * 3 + 1; // each row starts with filter type 0 (none)
  const rows = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * 4;
      if (rgba[from + 3] !== 255) throw new Error(`Pixel ${x},${y} isn't opaque`);
      rows.set(rgba.subarray(from, from + 3), y * stride + 1 + x * 3);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits per channel
  header[9] = RGB;
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
