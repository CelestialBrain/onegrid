// =============================================================================
// oneGrid SSRM mock server
//
// Plain Node http server speaking oneGrid's SSRM HTTP protocol. Holds 1M
// synthetic rows in memory, columnar (Struct-of-Arrays). Translates
// BlockRequests into filtered + sorted slices using @onegrid/data's same
// primitives the client uses, so the wire round-trip is fully exercised.
//
// Endpoints:
//   GET  /schema   → Schema
//   POST /block    body: BlockRequest   → BlockResponse<'json'>
//   GET  /healthz  → "ok"
//
// CORS enabled for any origin (development server only).
//
// Cursor encoding: `offset:N` (string), where N is the row index in the
// active query's sorted+filtered view. Lets the client jump directly to
// any row index — appropriate for the SsrmRowSource bridge in the canvas
// renderer, which needs random access.
// =============================================================================

import http from 'node:http';
import {
  createColumnTable,
  filterIndex,
  sortIndex,
  type ColumnInput,
} from '@onegrid/data';
import type { BlockRequest, BlockResponse, Schema } from '@onegrid/protocol';

// -----------------------------------------------------------------------------
// Synthetic dataset
// -----------------------------------------------------------------------------

const NUM_ROWS = Number(process.env.ROWS ?? '1000000');
const PORT = Number(process.env.PORT ?? '3001');

const FIRST_NAMES = [
  'Aiko', 'Bashir', 'Camila', 'Dmitri', 'Elena', 'Farhan', 'Gabriela', 'Hideki',
  'Imani', 'Jin', 'Kalani', 'Lior', 'Maya', 'Nadir', 'Olamide', 'Priya',
  'Quentin', 'Ravi', 'Saskia', 'Tomás', 'Uma', 'Viktor', 'Wren', 'Xiomara',
  'Yara', 'Zane',
];

const LAST_NAMES = [
  'Adeyemi', 'Bukowski', 'Chen', 'Dvorak', 'Eriksen', 'Fitzgerald', 'Garibay',
  'Halevi', 'Ivanova', 'Jónsson', 'Kapur', 'Lindqvist', 'Mokoena', 'Nakamura',
  'Okonkwo', 'Petrov', 'Quesada', 'Rinaldi', 'Saito', 'Tahir', 'Ueda', 'Vargas',
  'Watanabe', 'Xu', 'Yusuf', 'Zografos',
];

const STATUSES = ['active', 'pending', 'archived', 'pilot', 'churned'] as const;

console.log(`[onegrid:ssrm-mock] generating ${NUM_ROWS.toLocaleString()} synthetic rows…`);
const t0 = Date.now();

const ids = new Int32Array(NUM_ROWS);
const firstNames: string[] = new Array(NUM_ROWS);
const lastNames: string[] = new Array(NUM_ROWS);
const revenue = new Float64Array(NUM_ROWS);
const statuses: string[] = new Array(NUM_ROWS);
const scores = new Int32Array(NUM_ROWS);
const updatedAt: string[] = new Array(NUM_ROWS);

for (let i = 0; i < NUM_ROWS; i++) {
  ids[i] = i;
  firstNames[i] = FIRST_NAMES[i % FIRST_NAMES.length] ?? '';
  lastNames[i] = LAST_NAMES[(i * 17) % LAST_NAMES.length] ?? '';
  revenue[i] = ((i * 1009) % 1_000_000) / 100;
  statuses[i] = STATUSES[i % STATUSES.length] ?? 'active';
  scores[i] = (i * 31) % 100;
  const t = 1_700_000_000_000 + i * 60_000;
  updatedAt[i] = new Date(t).toISOString().slice(0, 16).replace('T', ' ');
}

const COLUMNS: ColumnInput[] = [
  { schema: { id: 'id', type: 'int32' }, data: ids },
  { schema: { id: 'firstName', type: 'utf8' }, data: firstNames },
  { schema: { id: 'lastName', type: 'utf8' }, data: lastNames },
  { schema: { id: 'revenue', type: 'float64' }, data: revenue },
  { schema: { id: 'status', type: 'utf8' }, data: statuses },
  { schema: { id: 'score', type: 'int32' }, data: scores },
  { schema: { id: 'updatedAt', type: 'utf8' }, data: updatedAt },
];

const TABLE = createColumnTable(COLUMNS);

const SCHEMA: Schema = TABLE.schema;

console.log(`[onegrid:ssrm-mock] generated in ${String(Date.now() - t0)} ms.`);

// -----------------------------------------------------------------------------
// Cursor helpers
// -----------------------------------------------------------------------------

function parseOffsetCursor(cursor: string | null): number {
  if (!cursor) return 0;
  if (cursor.startsWith('offset:')) {
    const n = Number(cursor.slice('offset:'.length));
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }
  return 0;
}

function encodeOffsetCursor(offset: number): string {
  return `offset:${String(offset)}`;
}

// -----------------------------------------------------------------------------
// Block fetch
// -----------------------------------------------------------------------------

function fetchBlock(req: BlockRequest): BlockResponse<'json'> {
  const sel = filterIndex(TABLE, req.filter);
  // Materialize filtered indices, sorted by req.sort.
  const filteredIndices = sel.toIndices();

  let permutation: Int32Array;
  if (req.sort.length === 0) {
    // Filtered indices are already in source order, which matches an
    // implicit sort by row id.
    permutation = filteredIndices;
  } else {
    // Sort the underlying table, then filter. Could be more efficient by
    // sorting only filtered rows; v0.0.3 keeps it simple.
    const fullPerm = sortIndex(TABLE, req.sort);
    const filterMask = sel;
    const out = new Int32Array(filteredIndices.length);
    let j = 0;
    for (let i = 0; i < fullPerm.length; i++) {
      const srcIdx = fullPerm[i] ?? 0;
      if (filterMask.contains(srcIdx)) {
        out[j++] = srcIdx;
      }
    }
    permutation = out.subarray(0, j);
  }

  const totalRowCount = permutation.length;
  const offset = parseOffsetCursor(req.cursor);
  const start = req.direction === 'after' ? offset : Math.max(0, offset - req.limit);
  const end = Math.min(totalRowCount, start + req.limit);

  const rows: Record<string, unknown>[] = [];
  for (let i = start; i < end; i++) {
    const srcIdx = permutation[i] ?? 0;
    const row: Record<string, unknown> = {};
    for (const col of TABLE.schema) {
      row[col.id] = TABLE.column(col.id).get(srcIdx);
    }
    rows.push(row);
  }

  const nextOffset = end < totalRowCount ? end : null;
  const prevOffset = start > 0 ? start : null;

  return {
    encoding: 'json',
    rows,
    nextCursor: nextOffset === null ? null : encodeOffsetCursor(nextOffset),
    prevCursor: prevOffset === null ? null : encodeOffsetCursor(prevOffset),
    totalRowCount,
  };
}

// -----------------------------------------------------------------------------
// HTTP server
// -----------------------------------------------------------------------------

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
  'Access-Control-Max-Age': '86400',
};

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    ...corsHeaders,
    'Content-Type': 'application/json',
  });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf-8');
    });
    req.on('end', () => {
      resolve(body);
    });
    req.on('error', reject);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/healthz') {
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  if (req.method === 'GET' && url.pathname === '/schema') {
    send(res, 200, SCHEMA);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/block') {
    void readBody(req).then(
      (body) => {
        let request: BlockRequest;
        try {
          request = JSON.parse(body) as BlockRequest;
        } catch {
          send(res, 400, { error: 'invalid json' });
          return;
        }
        try {
          const t = Date.now();
          const response = fetchBlock(request);
          const ms = Date.now() - t;
          console.log(
            `[onegrid:ssrm-mock] block cursor=${String(request.cursor)} dir=${request.direction} limit=${String(request.limit)} sort=${String(request.sort.length)} filter=${request.filter ? '1' : '0'} → ${String(response.rows.length)} rows in ${String(ms)}ms`,
          );
          send(res, 200, response);
        } catch (err) {
          console.error('[onegrid:ssrm-mock] error', err);
          send(res, 500, { error: String(err) });
        }
      },
      (err) => {
        console.error('[onegrid:ssrm-mock] body error', err);
        send(res, 500, { error: 'body read error' });
      },
    );
    return;
  }

  send(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`[onegrid:ssrm-mock] listening on http://localhost:${String(PORT)}`);
  console.log('[onegrid:ssrm-mock] endpoints: /healthz, /schema, /block');
});
