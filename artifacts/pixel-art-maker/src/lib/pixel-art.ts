import { Buffer } from 'buffer';
import * as GifPackage from 'gifenc';
import { decode } from 'jpeg-js';
import { deflate } from 'pako';

const gifenc = typeof GifPackage.GIFEncoder === 'function'
  ? GifPackage
  : GifPackage.default;
const { applyPalette, GIFEncoder, quantize } = gifenc;

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array;
}

export function decodeJpeg(base64: string): RgbaImage {
  const decoded = decode(Buffer.from(base64, 'base64'), {
    useTArray: true,
    maxResolutionInMP: 2,
    maxMemoryUsageInMB: 96,
  });
  return { width: decoded.width, height: decoded.height, data: decoded.data };
}

export function pixelate(image: RgbaImage, cellSize: number): RgbaImage {
  const result = new Uint8Array(image.data.length);
  const block = Math.max(2, Math.round(cellSize));

  for (let y = 0; y < image.height; y += block) {
    for (let x = 0; x < image.width; x += block) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      let count = 0;
      const endY = Math.min(y + block, image.height);
      const endX = Math.min(x + block, image.width);

      for (let sampleY = y; sampleY < endY; sampleY += Math.max(1, Math.floor(block / 3))) {
        for (let sampleX = x; sampleX < endX; sampleX += Math.max(1, Math.floor(block / 3))) {
          const offset = (sampleY * image.width + sampleX) * 4;
          red += image.data[offset] ?? 0;
          green += image.data[offset + 1] ?? 0;
          blue += image.data[offset + 2] ?? 0;
          alpha += image.data[offset + 3] ?? 255;
          count++;
        }
      }

      const color = [
        Math.round(red / count),
        Math.round(green / count),
        Math.round(blue / count),
        Math.round(alpha / count),
      ];
      for (let fillY = y; fillY < endY; fillY++) {
        for (let fillX = x; fillX < endX; fillX++) {
          const offset = (fillY * image.width + fillX) * 4;
          result[offset] = color[0] ?? 0;
          result[offset + 1] = color[1] ?? 0;
          result[offset + 2] = color[2] ?? 0;
          result[offset + 3] = color[3] ?? 255;
        }
      }
    }
  }
  return { width: image.width, height: image.height, data: result };
}

function uint32(value: number): Uint8Array {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function joinBytes(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((total, part) => total + part.length, 0);
  const joined = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}

function pngChunk(name: string, data: Uint8Array): Uint8Array {
  const type = new Uint8Array([...name].map((character) => character.charCodeAt(0)));
  const crcInput = joinBytes([type, data]);
  return joinBytes([uint32(data.length), type, data, uint32(crc32(crcInput))]);
}

export function encodePngBase64(image: RgbaImage): string {
  const rows = new Uint8Array((image.width * 4 + 1) * image.height);
  for (let y = 0; y < image.height; y++) {
    const rowOffset = y * (image.width * 4 + 1);
    rows[rowOffset] = 0;
    rows.set(
      image.data.subarray(y * image.width * 4, (y + 1) * image.width * 4),
      rowOffset + 1,
    );
  }

  const header = new Uint8Array(13);
  header.set(uint32(image.width), 0);
  header.set(uint32(image.height), 4);
  header[8] = 8;
  header[9] = 6;

  const png = joinBytes([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflate(rows, { level: 7 })),
    pngChunk('IEND', new Uint8Array()),
  ]);
  return Buffer.from(png).toString('base64');
}

function tintFrame(image: RgbaImage, frame: number): Uint8Array {
  const tinted = new Uint8Array(image.data.length);
  const phase = [0.94, 1.04, 1.1, 1][frame] ?? 1;
  const warmShift = [4, 14, 0, -8][frame] ?? 0;
  for (let i = 0; i < image.data.length; i += 4) {
    tinted[i] = Math.min(255, Math.max(0, (image.data[i] ?? 0) * phase + warmShift));
    tinted[i + 1] = Math.min(255, Math.max(0, (image.data[i + 1] ?? 0) * phase));
    tinted[i + 2] = Math.min(255, Math.max(0, (image.data[i + 2] ?? 0) * phase - warmShift * 0.35));
    tinted[i + 3] = image.data[i + 3] ?? 255;
  }
  return tinted;
}

export function encodeGifBase64(image: RgbaImage): string {
  const scale = Math.min(1, 512 / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const smallData = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(image.width - 1, Math.floor(x / scale));
      const sourceY = Math.min(image.height - 1, Math.floor(y / scale));
      const sourceOffset = (sourceY * image.width + sourceX) * 4;
      const targetOffset = (y * width + x) * 4;
      smallData.set(image.data.subarray(sourceOffset, sourceOffset + 4), targetOffset);
    }
  }
  const gifImage: RgbaImage = { width, height, data: smallData };
  const encoder = GIFEncoder();
  for (let frame = 0; frame < 4; frame++) {
    const rgba = tintFrame(gifImage, frame);
    const palette = quantize(rgba, 128);
    const indexed = applyPalette(rgba, palette);
    encoder.writeFrame(indexed, width, height, {
      palette,
      delay: 260,
      repeat: frame === 0 ? 0 : undefined,
    });
  }
  encoder.finish();
  return Buffer.from(encoder.bytes()).toString('base64');
}
