import { inflateRawSync } from "node:zlib";

/** A minimal ustar writer for tests (the manager uses tar-stream in production). */
export type TarInput = { name: string; type?: "0" | "5" | "2" | "x"; data?: string | Buffer; prefix?: string; mtime?: number };

function header(entry: TarInput, size: number): Buffer {
  const h = Buffer.alloc(512);
  h.write(entry.name, 0, 100, "utf8");
  h.write("0000644\0", 100);
  h.write("0001750\0", 108);
  h.write("0001750\0", 116);
  h.write(`${size.toString(8).padStart(11, "0")}\0`, 124);
  h.write(`${(entry.mtime ?? 1_700_000_000).toString(8).padStart(11, "0")}\0`, 136);
  h.write(entry.type ?? "0", 156);
  h.write("ustar\0", 257);
  h.write("00", 263);
  if (entry.prefix) h.write(entry.prefix, 345, 155, "utf8");
  h.fill(0x20, 148, 156);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
  return h;
}

export function makeTar(entries: TarInput[]): Buffer {
  const parts: Buffer[] = [];
  for (const entry of entries) {
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data ?? "");
    parts.push(header(entry, data.length), data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}

export function paxRecord(key: string, value: string): string {
  const body = ` ${key}=${value}\n`;
  let length = body.length + 1;
  while (`${length}${body}`.length !== length) length = `${length}${body}`.length;
  return `${length}${body}`;
}

/** Reads a zip back through its central directory. */
export function readZip(zip: Buffer): { name: string; data: Buffer }[] {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  const out: { name: string; data: Buffer }[] = [];
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(offset + 10);
    const size = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const local = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const localNameLength = zip.readUInt16LE(local + 26);
    const body = zip.subarray(local + 30 + localNameLength, local + 30 + localNameLength + size);
    out.push({ name, data: method === 8 ? inflateRawSync(body) : Buffer.from(body) });
    offset += 46 + nameLength;
  }
  return out;
}
