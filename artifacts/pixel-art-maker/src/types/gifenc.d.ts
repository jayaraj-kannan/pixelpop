declare module 'gifenc' {
  export interface GIFOptions {
    initialCapacity?: number;
    auto?: boolean;
  }

  export interface GIFWriteOptions {
    palette?: number[][];
    delay?: number;
    repeat?: number;
  }

  export interface GIFStream {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: GIFWriteOptions,
    ): void;
    finish(): void;
    bytes(): Uint8Array;
  }

  export function GIFEncoder(options?: GIFOptions): GIFStream;
  export function quantize(
    rgba: Uint8Array,
    maxColors: number,
    options?: Record<string, unknown>,
  ): number[][];
  export function applyPalette(
    rgba: Uint8Array,
    palette: number[][],
    format?: string,
  ): Uint8Array;
}
