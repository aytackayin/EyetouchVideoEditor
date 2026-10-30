/// <reference types="vite/client" />

declare module 'lamejs' {
  export class Mp3Encoder {
    constructor(channels: number, sampleRate: number, kbps: number);
    encodeBuffer(left: Int16Array, right?: Int16Array): Uint8Array;
    flush(): Uint8Array;
  }
}

declare module 'gifenc' {
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, options?: unknown): number[][];
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: number[][], format?: string): Uint8Array;
  export function GIFEncoder(options?: { auto?: boolean; initialCapacity?: number }): {
    writeFrame(index: Uint8Array, width: number, height: number, opts: { palette: number[][]; delay: number; transparent?: boolean; first?: boolean }): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    reset(): void;
  };
}
