import type { Readable } from "node:stream";

export function isoNow(): string {
  return new Date().toISOString();
}

export function elapsedMs(startedAt: number): number {
  return Math.max(0, performance.now() - startedAt);
}

export class BoundedByteCounter {
  readonly limitBytes: number;
  bytes = 0;
  truncated = false;

  constructor(limitBytes: number) {
    this.limitBytes = limitBytes;
  }

  add(chunk: Buffer | string) {
    const size = typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.byteLength;
    this.bytes += size;
    if (this.bytes > this.limitBytes) this.truncated = true;
  }

  attach(stream: Readable | null | undefined) {
    if (!stream) return;
    stream.on("data", (chunk) => {
      if (typeof chunk === "string" || Buffer.isBuffer(chunk)) {
        this.add(chunk);
        return;
      }
      this.add(Buffer.from(String(chunk)));
    });
  }
}
