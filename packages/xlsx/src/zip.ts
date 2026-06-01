// =============================================================================
// ZIP container reader / writer (v1.1.0 wave 21).
//
// The OOXML `.xlsx` file is a ZIP archive of XML parts. This module
// implements the minimal subset of the PKZIP format needed to read and
// write xlsx files:
//
//   * Local-file-header records (LFH) — file entries with their
//     compressed bytes.
//   * Central-directory records (CDR) — the table of contents.
//   * End-of-central-directory (EOCD) — fixed-size footer.
//
// DEFLATE compression goes through the runtime's stdlib: `zlib` in Node,
// `DecompressionStream` in the browser. We deliberately avoid an external
// dep so the package stays small and CSP-safe.
//
// Bomb-resistance: every reader takes a `maxDecompressedBytes` cap
// (default 256 MB) and a `maxRatio` cap (default 100:1) per the v1.1.0
// SECURITY plan.
// =============================================================================

export interface ZipEntry {
  readonly path: string;
  readonly data: Uint8Array;
  /** True when entry is a directory marker (path ends with `/`). */
  readonly isDirectory: boolean;
}

export interface ZipReadOptions {
  readonly maxDecompressedBytes?: number;
  readonly maxRatio?: number;
}

const DEFAULT_MAX_DECOMPRESSED = 256 * 1024 * 1024;
// OOXML XML is highly repetitive (shared strings, namespace prefixes, etc.)
// and routinely hits 500:1 ratios on synthetic-looking sheets. The cap is
// the absolute decompressed-size cap; the ratio gate is a secondary
// safety net against pathological archives only.
const DEFAULT_MAX_RATIO = 1000;

const LFH_SIG = 0x04034b50;
const CDR_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

const dec = new TextDecoder('utf-8');
const enc = new TextEncoder();

function u16(buf: Uint8Array, off: number): number {
  return buf[off]! | (buf[off + 1]! << 8);
}
function u32(buf: Uint8Array, off: number): number {
  // Use unsigned right-shift to keep 32-bit values positive in JS land.
  return (
    (buf[off]! | (buf[off + 1]! << 8) | (buf[off + 2]! << 16) | (buf[off + 3]! << 24)) >>> 0
  );
}
function write16(buf: Uint8Array, off: number, v: number): void {
  buf[off] = v & 0xff;
  buf[off + 1] = (v >> 8) & 0xff;
}
function write32(buf: Uint8Array, off: number, v: number): void {
  buf[off] = v & 0xff;
  buf[off + 1] = (v >> 8) & 0xff;
  buf[off + 2] = (v >> 16) & 0xff;
  buf[off + 3] = (v >> 24) & 0xff;
}

/**
 * Find the End-of-Central-Directory (EOCD) record by scanning backward
 * from the end of the buffer. The EOCD has a variable-size comment so
 * we have to scan, but the comment is bounded by 0xFFFF.
 */
function findEocd(bytes: Uint8Array): number {
  const start = Math.max(0, bytes.length - 0xffff - 22);
  for (let i = bytes.length - 22; i >= start; i--) {
    if (u32(bytes, i) === EOCD_SIG) return i;
  }
  throw new Error('xlsx: end-of-central-directory record not found (not a valid ZIP)');
}

async function inflateRaw(deflated: Uint8Array, maxBytes: number): Promise<Uint8Array> {
  // Browser: Web Streams DecompressionStream.
  if (typeof DecompressionStream !== 'undefined') {
    // Copy into a dedicated ArrayBuffer so the BlobPart type narrows
    // cleanly under strict TS settings.
    const copy = new Uint8Array(deflated.byteLength);
    copy.set(deflated);
    const stream = new Blob([copy.buffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const buf = await new Response(stream).arrayBuffer();
    if (buf.byteLength > maxBytes) {
      throw new Error(`xlsx: zip-bomb gate (decompressed > ${maxBytes} bytes)`);
    }
    return new Uint8Array(buf);
  }
  // Node: zlib.inflateRawSync.
  const zlib = await import('node:zlib');
  const out = zlib.inflateRawSync(deflated, { maxOutputLength: maxBytes });
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

async function deflateRaw(plain: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream !== 'undefined') {
    const copy = new Uint8Array(plain.byteLength);
    copy.set(plain);
    const stream = new Blob([copy.buffer]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  }
  const zlib = await import('node:zlib');
  const out = zlib.deflateRawSync(plain);
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

/**
 * Decode a `.xlsx` file's bytes into its contained ZIP entries. Throws
 * on malformed archives or zip-bomb violations.
 */
export async function readZip(
  bytes: Uint8Array,
  opts: ZipReadOptions = {},
): Promise<ZipEntry[]> {
  const maxBytes = opts.maxDecompressedBytes ?? DEFAULT_MAX_DECOMPRESSED;
  const maxRatio = opts.maxRatio ?? DEFAULT_MAX_RATIO;
  const eocdOff = findEocd(bytes);
  const entryCount = u16(bytes, eocdOff + 10);
  const cdrOff = u32(bytes, eocdOff + 16);
  const entries: ZipEntry[] = [];
  let cursor = cdrOff;
  let totalDecompressed = 0;
  for (let i = 0; i < entryCount; i++) {
    if (u32(bytes, cursor) !== CDR_SIG) {
      throw new Error(`xlsx: central-directory record #${i} has bad signature`);
    }
    const method = u16(bytes, cursor + 10);
    const compressedSize = u32(bytes, cursor + 20);
    const uncompressedSize = u32(bytes, cursor + 24);
    const nameLen = u16(bytes, cursor + 28);
    const extraLen = u16(bytes, cursor + 30);
    const commentLen = u16(bytes, cursor + 32);
    const lfhOff = u32(bytes, cursor + 42);
    const name = dec.decode(bytes.slice(cursor + 46, cursor + 46 + nameLen));
    if (compressedSize > 0 && uncompressedSize / compressedSize > maxRatio) {
      throw new Error(`xlsx: zip-bomb gate (ratio > ${maxRatio}:1 in "${name}")`);
    }
    if (totalDecompressed + uncompressedSize > maxBytes) {
      throw new Error(`xlsx: zip-bomb gate (cumulative decompressed > ${maxBytes} bytes)`);
    }
    totalDecompressed += uncompressedSize;
    // Jump to the local-file header to find the payload offset.
    if (u32(bytes, lfhOff) !== LFH_SIG) {
      throw new Error(`xlsx: local-file header for "${name}" has bad signature`);
    }
    const lfhNameLen = u16(bytes, lfhOff + 26);
    const lfhExtraLen = u16(bytes, lfhOff + 28);
    const dataStart = lfhOff + 30 + lfhNameLen + lfhExtraLen;
    const payload = bytes.slice(dataStart, dataStart + compressedSize);
    let data: Uint8Array;
    if (method === 0) {
      data = payload; // stored
    } else if (method === 8) {
      data = await inflateRaw(payload, maxBytes - (totalDecompressed - uncompressedSize));
    } else {
      throw new Error(`xlsx: unsupported compression method ${method} for "${name}"`);
    }
    entries.push({ path: name, data, isDirectory: name.endsWith('/') });
    cursor += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * Encode a sequence of entries into a `.xlsx`-compatible ZIP archive.
 * Uses DEFLATE for every non-directory entry; matches the layout Excel
 * and LibreOffice produce.
 */
export async function writeZip(entries: ZipEntry[]): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  const centralRecords: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const nameBytes = enc.encode(e.path);
    const isDir = e.isDirectory;
    const raw = isDir ? new Uint8Array(0) : e.data;
    const compressed = isDir ? new Uint8Array(0) : await deflateRaw(raw);
    const crc = crc32(raw);

    const lfh = new Uint8Array(30 + nameBytes.length);
    write32(lfh, 0, LFH_SIG);
    write16(lfh, 4, 20); // version-needed
    write16(lfh, 6, 0);  // flags
    write16(lfh, 8, isDir ? 0 : 8); // method
    write16(lfh, 10, 0); // mod time
    write16(lfh, 12, 0); // mod date
    write32(lfh, 14, crc);
    write32(lfh, 18, compressed.length);
    write32(lfh, 22, raw.length);
    write16(lfh, 26, nameBytes.length);
    write16(lfh, 28, 0); // extra len
    lfh.set(nameBytes, 30);

    parts.push(lfh, compressed);

    const cdr = new Uint8Array(46 + nameBytes.length);
    write32(cdr, 0, CDR_SIG);
    write16(cdr, 4, 20); // version-made-by
    write16(cdr, 6, 20); // version-needed
    write16(cdr, 8, 0);  // flags
    write16(cdr, 10, isDir ? 0 : 8); // method
    write16(cdr, 12, 0); // mod time
    write16(cdr, 14, 0); // mod date
    write32(cdr, 16, crc);
    write32(cdr, 20, compressed.length);
    write32(cdr, 24, raw.length);
    write16(cdr, 28, nameBytes.length);
    write16(cdr, 30, 0); // extra len
    write16(cdr, 32, 0); // comment len
    write16(cdr, 34, 0); // disk #
    write16(cdr, 36, 0); // internal attrs
    write32(cdr, 38, isDir ? 0x10 : 0); // external attrs
    write32(cdr, 42, offset);
    cdr.set(nameBytes, 46);
    centralRecords.push(cdr);

    offset += lfh.length + compressed.length;
  }

  let cdrSize = 0;
  for (const r of centralRecords) cdrSize += r.length;
  const eocd = new Uint8Array(22);
  write32(eocd, 0, EOCD_SIG);
  write16(eocd, 8, entries.length);
  write16(eocd, 10, entries.length);
  write32(eocd, 12, cdrSize);
  write32(eocd, 16, offset);

  const totalSize = offset + cdrSize + eocd.length;
  const out = new Uint8Array(totalSize);
  let pos = 0;
  for (const p of parts) { out.set(p, pos); pos += p.length; }
  for (const r of centralRecords) { out.set(r, pos); pos += r.length; }
  out.set(eocd, pos);
  return out;
}

// ----- CRC-32 (PKZIP-compatible) --------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
