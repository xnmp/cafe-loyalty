import { describe, expect, test } from '@jest/globals';
import { crc32, inflateSync } from 'node:zlib';

import { rgbPng } from './png';

/** The chunks of a PNG, checking the signature and every CRC on the way. */
function chunks(png: Buffer): { type: string; data: Buffer }[] {
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const out: { type: string; data: Buffer }[] = [];
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at);
    const body = png.subarray(at + 4, at + 8 + length);
    expect(png.readUInt32BE(at + 8 + length)).toBe(crc32(body));
    out.push({ type: body.subarray(0, 4).toString('ascii'), data: body.subarray(4) });
    at += 12 + length;
  }
  return out;
}

/** Decodes the pixels of an unfiltered 8-bit RGB PNG. */
function rgbPixels(png: Buffer): { width: number; height: number; colourType: number; pixels: number[][] } {
  const all = chunks(png);
  const header = all[0].data;
  const [width, height, colourType] = [header.readUInt32BE(0), header.readUInt32BE(4), header[9]];
  const rows = inflateSync(Buffer.concat(all.filter((c) => c.type === 'IDAT').map((c) => c.data)));
  const pixels: number[][] = [];
  for (let y = 0; y < height; y++) {
    const row = rows.subarray(y * (width * 3 + 1), (y + 1) * (width * 3 + 1));
    expect(row[0]).toBe(0);
    for (let x = 0; x < width; x++) pixels.push([...row.subarray(1 + x * 3, 4 + x * 3)]);
  }
  return { width, height, colourType, pixels };
}

describe('rgbPng', () => {
  test('keeps every pixel and drops the alpha channel', () => {
    const rgba = Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 12, 34, 56, 255, 0, 0, 0, 255, 255, 255, 255, 255]);
    const png = rgbPng(rgba, 3, 2);
    expect(chunks(png).map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(rgbPixels(png)).toEqual({
      width: 3,
      height: 2,
      colourType: 2,
      pixels: [[255, 0, 0], [0, 255, 0], [0, 0, 255], [12, 34, 56], [0, 0, 0], [255, 255, 255]],
    });
  });

  test('encodes a full-size App Store screenshot', () => {
    const [width, height] = [1320, 2868];
    const rgba = new Uint8Array(width * height * 4).fill(255);
    const decoded = rgbPixels(rgbPng(rgba, width, height));
    expect([decoded.width, decoded.height, decoded.pixels.length]).toEqual([width, height, width * height]);
  });

  test('refuses a pixel that is not opaque', () => {
    expect(() => rgbPng(Uint8Array.from([1, 2, 3, 255, 4, 5, 6, 128]), 2, 1)).toThrow('Pixel 1,0');
  });

  test('refuses pixel data that does not match the size', () => {
    expect(() => rgbPng(new Uint8Array(15).fill(255), 2, 2)).toThrow('Expected 16 bytes');
    expect(() => rgbPng(new Uint8Array(0), 0, 0)).toThrow('Bad image size');
    expect(() => rgbPng(new Uint8Array(4).fill(255), 1.5, 1)).toThrow('Bad image size');
  });
});
