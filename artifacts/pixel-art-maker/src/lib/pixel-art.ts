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

export type GifEffect = 'pulse' | 'bounce' | 'sway' | 'zoom' | 'wobble';
export interface GifOptions {
  effect: GifEffect;
  speed: 'slow' | 'normal' | 'fast';
  strength: 'gentle' | 'normal' | 'bold';
}
export const DEFAULT_GIF_OPTIONS: GifOptions = {
  effect: 'pulse',
  speed: 'normal',
  strength: 'normal',
};
const GIF_FRAME_COUNT = 12;
const STRENGTH = { gentle: 0.35, normal: 0.65, bold: 1 };
const LOOP_DURATION = { slow: 2400, normal: 1440, fast: 840 };

function pulseColor(color: number[], phase: number, strength: number): number[] {
  const wave = Math.sin(phase) * strength;
  const brightness = 1 + wave * 0.16;
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  return [
    clamp((color[0] ?? 0) * brightness + wave * 14),
    clamp((color[1] ?? 0) * brightness),
    clamp((color[2] ?? 0) * brightness - wave * 6),
  ];
}

/** Render a full frame with nearest-neighbor sampling to preserve pixel edges. */
export function renderGifFrame(
  image: RgbaImage,
  frame: number,
  options: GifOptions = DEFAULT_GIF_OPTIONS,
): Uint8Array {
  const phase = (frame / GIF_FRAME_COUNT) * Math.PI * 2;
  const strength = STRENGTH[options.strength];
  const wave = Math.sin(phase) * strength;
  const output = new Uint8Array(image.data.length);
  if (options.effect === 'pulse') {
    for (let i = 0; i < image.data.length; i += 4) {
      output.set(pulseColor(Array.from(image.data.subarray(i, i + 3)), phase, strength), i);
      output[i + 3] = image.data[i + 3] ?? 255;
    }
    return output;
  }
  const dx = options.effect === 'sway' ? wave * image.width * 0.08 : 0;
  const dy = options.effect === 'bounce' ? wave * image.height * 0.08 : 0;
  const angle = options.effect === 'wobble' ? wave * 0.14 : 0;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const zoom = options.effect === 'zoom'
    ? 1 + (1 - Math.cos(phase)) * strength * 0.12
    : 1;
  // Overscan keeps the whole canvas filled when the photo moves or rotates.
  const scale = Math.max(
    zoom,
    (Math.abs(cosine) * image.width + Math.abs(sine) * image.height
      + 2 * Math.abs(cosine * dx + sine * dy)) / image.width,
    (Math.abs(sine) * image.width + Math.abs(cosine) * image.height
      + 2 * Math.abs(-sine * dx + cosine * dy)) / image.height,
  );
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const localX = x + 0.5 - image.width / 2 - dx;
      const localY = y + 0.5 - image.height / 2 - dy;
      const sourceX = Math.max(0, Math.min(image.width - 1, Math.floor(
        (cosine * localX + sine * localY) / scale + image.width / 2,
      )));
      const sourceY = Math.max(0, Math.min(image.height - 1, Math.floor(
        (-sine * localX + cosine * localY) / scale + image.height / 2,
      )));
      const source = (sourceY * image.width + sourceX) * 4;
      const target = (y * image.width + x) * 4;
      output[target] = image.data[source] ?? 0;
      output[target + 1] = image.data[source + 1] ?? 0;
      output[target + 2] = image.data[source + 2] ?? 0;
      output[target + 3] = image.data[source + 3] ?? 255;
    }
  }
  return output;
}

export function encodeGifBase64(
  image: RgbaImage,
  options: GifOptions = DEFAULT_GIF_OPTIONS,
): string {
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
  const basePalette = quantize(gifImage.data, 128);
  const sourceIndices = applyPalette(gifImage.data, basePalette);
  const delay = LOOP_DURATION[options.speed] / GIF_FRAME_COUNT;
  for (let frame = 0; frame < GIF_FRAME_COUNT; frame++) {
    const isPulse = options.effect === 'pulse';
    const palette = isPulse
      ? basePalette.map((color) => pulseColor(
        color, (frame / GIF_FRAME_COUNT) * Math.PI * 2, STRENGTH[options.strength],
      ))
      : basePalette;
    const indexed = isPulse
      ? sourceIndices
      : applyPalette(renderGifFrame(gifImage, frame, options), palette);
    encoder.writeFrame(indexed, width, height, {
      palette,
      delay,
      repeat: frame === 0 ? 0 : undefined,
    });
  }
  encoder.finish();
  return Buffer.from(encoder.bytes()).toString('base64');
}
