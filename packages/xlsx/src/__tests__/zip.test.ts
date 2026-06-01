// =============================================================================
// @onegrid/xlsx — ZIP container + OPC graph (wave 21).
// =============================================================================

import { describe, expect, it } from 'vitest';
import { OpcPackage, readPackage, readZip, writePackage, writeZip } from '../index';

const dec = new TextDecoder('utf-8');
const enc = new TextEncoder();

describe('@onegrid/xlsx — readZip / writeZip round-trip', () => {
  it('round-trips a single text entry', async () => {
    const bytes = await writeZip([
      { path: 'hello.txt', data: enc.encode('hello world'), isDirectory: false },
    ]);
    const entries = await readZip(bytes);
    expect(entries.length).toBe(1);
    expect(entries[0]!.path).toBe('hello.txt');
    expect(dec.decode(entries[0]!.data)).toBe('hello world');
  });

  it('round-trips multiple entries', async () => {
    const items = [
      { path: 'a.xml', data: enc.encode('<a/>'), isDirectory: false },
      { path: 'sub/b.xml', data: enc.encode('<b><c/></b>'), isDirectory: false },
      { path: 'sub/c.xml', data: enc.encode('xxx'), isDirectory: false },
    ];
    const bytes = await writeZip(items);
    const entries = await readZip(bytes);
    expect(entries.map((e) => e.path)).toEqual(['a.xml', 'sub/b.xml', 'sub/c.xml']);
    for (let i = 0; i < items.length; i++) {
      expect(dec.decode(entries[i]!.data)).toBe(dec.decode(items[i]!.data));
    }
  });

  it('handles larger payloads (DEFLATE path)', async () => {
    // A 100 KB body with moderate redundancy (compresses ~10x), well under
    // the default zip-bomb ratio gate.
    const chunk = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const text = chunk.repeat(3000);
    const bytes = await writeZip([
      { path: 'big.txt', data: enc.encode(text), isDirectory: false },
    ]);
    expect(bytes.length).toBeLessThan(text.length / 2);
    const entries = await readZip(bytes);
    expect(dec.decode(entries[0]!.data)).toBe(text);
  });

  it('rejects non-zip bytes', async () => {
    await expect(readZip(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(/end-of-central-directory/);
  });
});

describe('@onegrid/xlsx — bomb-resistance', () => {
  it('decompressed-byte cap surfaces as a clear error', async () => {
    const big = enc.encode('x'.repeat(2_000_000));
    const bytes = await writeZip([{ path: 'big.txt', data: big, isDirectory: false }]);
    await expect(readZip(bytes, { maxDecompressedBytes: 1024 })).rejects.toThrow(/zip-bomb/);
  });
});

describe('@onegrid/xlsx — readPackage / OpcPackage', () => {
  it('parses [Content_Types].xml + root rels + a workbook', async () => {
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
</Types>`;
    const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
    const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
    const bytes = await writeZip([
      { path: '[Content_Types].xml', data: enc.encode(contentTypes), isDirectory: false },
      { path: '_rels/.rels', data: enc.encode(rootRels), isDirectory: false },
      { path: 'xl/workbook.xml', data: enc.encode(workbook), isDirectory: false },
    ]);
    const pkg = await readPackage(bytes);
    expect(pkg.listParts().map((p) => p.uri).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
    ]);
    const rootRel = pkg.getRelationships('');
    expect(rootRel.length).toBe(1);
    expect(rootRel[0]!.target).toBe('xl/workbook.xml');
    expect(pkg.followFirst('', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument')?.uri).toBe('xl/workbook.xml');
  });

  it('writePackage round-trips a 3-part package', async () => {
    const parts = [
      { uri: '[Content_Types].xml', text: '', bytes: enc.encode('<Types/>') },
      { uri: '_rels/.rels', text: '', bytes: enc.encode('<Relationships/>') },
      { uri: 'xl/workbook.xml', text: '', bytes: enc.encode('<workbook/>') },
    ];
    const rels = new Map<string, Array<{ id: string; type: string; target: string }>>();
    const pkg = OpcPackage.fromEntries(parts, rels);
    const bytes = await writePackage(pkg);
    const reread = await readPackage(bytes);
    expect(reread.listParts().map((p) => p.uri).sort()).toEqual(
      parts.map((p) => p.uri).sort(),
    );
  });
});
