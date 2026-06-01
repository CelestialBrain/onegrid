// =============================================================================
// Open Packaging Conventions (OPC) — ECMA-376 Part 2.
//
// An `.xlsx` file is an OPC package: a ZIP archive whose parts are addressed
// by URI and connected by relationships. This module turns the flat list of
// ZIP entries into a queryable parts-and-relationships graph.
// =============================================================================

import { readZip, writeZip, type ZipEntry, type ZipReadOptions } from './zip';
import { unescapeXml } from './xml';

export interface OpcPart {
  /** URI within the package, e.g. `xl/workbook.xml`. */
  readonly uri: string;
  /** UTF-8 decoded body (parts are XML in xlsx). */
  readonly text: string;
  /** Raw bytes for binary parts (images, vbaProject, etc.). */
  readonly bytes: Uint8Array;
}

export interface OpcRelationship {
  readonly id: string;
  readonly type: string;
  /** Target URI, normalized to package-rooted (no leading "/"). */
  readonly target: string;
}

const dec = new TextDecoder('utf-8');

export class OpcPackage {
  constructor(
    private readonly parts: Map<string, OpcPart>,
    private readonly relsByPart: Map<string, OpcRelationship[]>,
  ) {}

  /** Fetch a part by its URI. */
  getPart(uri: string): OpcPart | undefined {
    return this.parts.get(normalizeUri(uri));
  }

  /** All parts in insertion order. */
  listParts(): ReadonlyArray<OpcPart> {
    return Array.from(this.parts.values());
  }

  /**
   * Get the relationships defined for a given part. `''` returns the
   * package root relationships from `_rels/.rels`.
   */
  getRelationships(partUri: string): ReadonlyArray<OpcRelationship> {
    return this.relsByPart.get(normalizeUri(partUri)) ?? [];
  }

  /**
   * Find the first part reachable from `from` via a relationship of the
   * named type. Walks just one hop — multi-step traversal is the caller's.
   */
  followFirst(from: string, type: string): OpcPart | undefined {
    const rels = this.getRelationships(from);
    const rel = rels.find((r) => r.type === type);
    if (!rel) return undefined;
    return this.getPart(resolveTarget(from, rel.target));
  }

  /** Build a new OpcPackage from an in-memory part list. */
  static fromEntries(parts: OpcPart[], rels: ReadonlyMap<string, OpcRelationship[]>): OpcPackage {
    const map = new Map<string, OpcPart>();
    for (const p of parts) map.set(normalizeUri(p.uri), p);
    return new OpcPackage(map, new Map(rels));
  }
}

export async function readPackage(
  bytes: Uint8Array,
  opts?: ZipReadOptions,
): Promise<OpcPackage> {
  const entries = await readZip(bytes, opts);
  const parts = new Map<string, OpcPart>();
  const relsByPart = new Map<string, OpcRelationship[]>();
  for (const e of entries) {
    if (e.isDirectory) continue;
    const text = isTextPart(e.path) ? dec.decode(e.data) : '';
    parts.set(normalizeUri(e.path), { uri: e.path, text, bytes: e.data });
  }
  // Parse every `.rels` part into the relationships table.
  for (const [uri, part] of parts) {
    if (!uri.endsWith('.rels')) continue;
    const ownerUri = uri === '_rels/.rels' ? '' : extractOwnerUri(uri);
    const rels = parseRelsXml(part.text);
    relsByPart.set(ownerUri, rels);
  }
  return new OpcPackage(parts, relsByPart);
}

export async function writePackage(pkg: OpcPackage): Promise<Uint8Array> {
  const entries: ZipEntry[] = [];
  for (const part of pkg.listParts()) {
    entries.push({ path: part.uri, data: part.bytes, isDirectory: false });
  }
  return writeZip(entries);
}

// ----- helpers ---------------------------------------------------------------

function normalizeUri(uri: string): string {
  return uri.replace(/^\/+/, '');
}

function isTextPart(uri: string): boolean {
  return /\.(xml|rels|xml\.rels)$/.test(uri);
}

function extractOwnerUri(relsUri: string): string {
  // `xl/_rels/workbook.xml.rels` → owner is `xl/workbook.xml`.
  const m = /^(.*)\/_rels\/(.+)\.rels$/.exec(relsUri);
  if (!m) return '';
  const dir = m[1]!;
  const name = m[2]!;
  return `${dir}/${name}`;
}

function resolveTarget(fromUri: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  if (!fromUri) return target;
  const fromDir = fromUri.includes('/') ? fromUri.slice(0, fromUri.lastIndexOf('/')) : '';
  if (!fromDir) return target;
  return normalizeUri(`${fromDir}/${target}`);
}

// Match `<Relationship ...>` and `<Relationship .../>`. The attribute body
// is captured non-greedily through the closing `/>` or `>`; `/` inside
// attribute values (paths!) is allowed because we anchor on the closing
// `>` not the `/`.
const REL_TAG_RE = /<Relationship\s+([\s\S]*?)\/?>/g;
const ATTR_RE = /(\w+)="([^"]*)"/g;

function parseRelsXml(text: string): OpcRelationship[] {
  const out: OpcRelationship[] = [];
  for (const m of text.matchAll(REL_TAG_RE)) {
    const attrs: Record<string, string> = {};
    for (const a of (m[1] ?? '').matchAll(ATTR_RE)) {
      attrs[a[1]!] = unescapeXml(a[2]!);
    }
    if (attrs.Id && attrs.Type && attrs.Target) {
      out.push({ id: attrs.Id, type: attrs.Type, target: attrs.Target });
    }
  }
  return out;
}
