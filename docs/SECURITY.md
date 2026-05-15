# Security model

This document describes oneGrid's threat model, the boundaries we
defend, and the boundaries we explicitly don't.

## Threat model

oneGrid is a **client-side library** that ingests data and renders it.
The adopter app is the security boundary — oneGrid does not enforce
authentication, authorization, or row-level access control.

Adopters who treat oneGrid as if it did face two specific risks:

1. **XSS via cell renderers** — values flowing from an untrusted
   source through the canvas renderer into the DOM overlay
2. **Injection via formulas / filter expressions** — user-typed
   formulas evaluated against trusted data

Both are addressed below.

## In scope (we defend against these)

### XSS in cell rendering

- The **canvas renderer** writes text via `ctx.fillText`. Canvas
  text is not HTML; there is no element-injection path.
- **DOM overlays** (custom cell renderers, detail panels, status bar,
  tooltip) use `textContent` or React's safe-by-default JSX. Test:
  `apps/benchmarks/src/tooltip.spec.ts` (asserts text passes through
  unsanitized but cannot inject elements).
- The **accessibility shadow** uses safe element creation —
  `document.createElement` + `textContent`, never `innerHTML`.
- `@onegrid/headless`'s `renderAccessibilityShadowHTML()` for SSR
  passes every cell value through `escapeHtml()` before emitting.
  Test: `apps/playground/src/v009-demo.tsx` SSR output spec asserts
  `<script>` becomes `&lt;script&gt;`.

### SQL injection in adapters

- Every adapter (`@onegrid/postgres`, `@onegrid/mysql`,
  `@onegrid/sqlite`, `@onegrid/clickhouse`, `@onegrid/duckdb`) uses
  **parameterized queries exclusively**. Filter values flow as `$1` /
  `?` / `{p0:Type}` parameters; column names are matched against the
  adapter's `descriptor.columns` allowlist before splicing into the
  query template.
- The Drizzle and Kysely adapters delegate to their host library's
  query builder; SQL string concatenation is impossible by
  construction.
- Test: each adapter package's `__tests__/sql.test.ts` includes a
  malicious-input case (`name = "'; DROP TABLE users; --"`) and
  asserts the malicious string lands as a parameter, not as SQL.

### Formula evaluation

- `@onegrid/formula` parses formulas into an AST, then evaluates
  the AST against a `CellResolver`. **No `eval`**, no `new Function()`,
  no string-to-code path anywhere.
- Function arguments are integer-counted at parse time;
  variadic functions list explicitly. Unknown function names emit
  `#NAME?` errors, never `eval`.
- Recursive cell references stop at a configured depth limit and
  emit `#REF!`.
- Test: `packages/formula/src/__tests__/*` covers parser fuzzing
  (malformed strings, unbalanced brackets, oversized inputs).

### Worker-plugin message validation

- `@onegrid/worker-plugins` posts JSON-RPC-shaped envelopes between
  host and worker. The worker dispatcher validates `kind === 'invoke'`
  and looks up the handler by name; unknown handlers return
  `{ ok: false, error }` rather than dynamic dispatch.
- No `eval` or `Function` constructor at either end.
- Test: `packages/worker-plugins/src/__tests__/*` covers unknown
  handler names and malformed messages.

### Cross-source SQL composition

- `@onegrid/duckdb-join` registers user-supplied rows as DuckDB views
  via `VALUES (...)` literals. String values are escaped with
  doubled single-quotes; numerics pass through `Number()`; dates
  emit as `TIMESTAMP 'iso8601'` literals.
- Identifier names (view names, column names) are escaped via
  `name.replace(/"/g, '""')` before quote-wrapping. A view name of
  `"; DROP TABLE` becomes the literal `"""; DROP TABLE"`.
- Test: `packages/duckdb-join/src/__tests__/duckdb-join.test.ts`
  covers `"it's fine"`, NaN, Date, and a malicious identifier case.

### MCP-proposed mutations

- `@onegrid/mcp`'s `propose_mutation` tool **never auto-applies**.
  Every mutation routes through `bridge.onMutation`; the host decides
  apply / queue / deny. A throw becomes MCP error `-32005 (DENIED)`.
- This is the load-bearing defense against LLM-prompted data
  corruption: even if the prompt convinces the model to issue a
  `propose_mutation` for every row in the table, the host's
  `onMutation` hook sees each one and can reject.
- Test: `packages/mcp/src/__tests__/mcp.test.ts` covers the denial
  round-trip; `apps/benchmarks/src/v011.spec.ts` exercises it end-
  to-end.

### CSP compatibility

- oneGrid runs under `Content-Security-Policy` headers including
  `script-src 'self'` (no `'unsafe-eval'`, no `'unsafe-inline'`).
- The canvas renderer uses no inline event handlers; all listeners
  attach via `addEventListener`.
- WebGPU compute kernels (`@onegrid/webgpu`) compile WGSL via
  `device.createShaderModule({ code })`. WGSL is parsed by the GPU
  driver, not eval'd in JS. No CSP issue.
- The WebGPU render scaffold (`@onegrid/webgpu-render`) is the same
  story.

## Out of scope (adopter's responsibility)

These are explicit non-goals; treating oneGrid as if it covered
them is the adopter's risk:

- **Authentication** — oneGrid never sees who the user is. Adopters
  authenticate with their backend before passing a `DataSource` in.
- **Authorization / RLS** — server-side. The grid renders whatever
  the `DataSource` returns. v0.0.9 item 11 (multi-tenancy / RLS)
  is a research-pending design item — when it ships, it will be a
  client-side **cosmetic** layer (hide / disable / read-only per
  column), with the server-canonical filter happening at the
  `BlockRequest` boundary.
- **Network transport security** — adopters bring their own TLS,
  WebSocket, fetch wrapper, etc. `@onegrid/ssrm`'s HTTP transport is
  a thin `fetch` wrapper; it inherits the page's CORS and credentials
  policy.
- **CDC payload integrity** — if a malicious actor can forge a row-
  diff to the client, they can write whatever they want to the cache.
  The CDC channel must be authenticated.
- **CRDT trust** — `@onegrid/crdt` bridges Yjs/Automerge documents
  into row diffs. Yjs's awareness protocol is the trust boundary;
  if it's open to public writes, anyone can edit any cell. That's
  Yjs's threat model, not ours.

## Reporting vulnerabilities

Email **security@onegrid.dev** with:

- A description of the issue
- Reproduction steps (a minimal test case is gold)
- Affected version(s)
- Suggested severity (Low / Medium / High / Critical) — we'll re-rate
  on receipt

We aim to acknowledge within 48 hours and ship a patch release within
14 days for High/Critical issues. CVEs get filed for every released
fix above Low severity.

**Do not file vulnerabilities as public GitHub issues** — those are
indexed in seconds. The mailbox is the right channel.

## Known limitations

- **No fuzzing in CI yet.** The unit suites test specific malicious
  inputs but don't fuzz at scale. Scheduled for v1.0.0 final.
- **The Worker-plugin sandbox is not an iframe sandbox.** Workers
  isolate compute but share origin. If a plugin needs DOM-scope
  isolation (e.g., to render a third-party UI), the adopter wires
  an iframe around `bindGestures` themselves.
- **No `Trusted Types` integration.** v1.0.x will add a policy
  binding for adopters opted into Trusted Types via CSP.

## Audit status

- v0.0.5 — informal review (engineering work only)
- v0.0.8 — adapter SQL injection sweep (passed; documented above)
- v1.0.0-rc — **THIS DOCUMENT.** Threat model published; spot-check
  tests in place. Formal third-party penetration test scheduled for
  v1.0.0 final.
- v1.0.0 — third-party audit report linked here.
