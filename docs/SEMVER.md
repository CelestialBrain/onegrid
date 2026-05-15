# Semantic versioning policy

oneGrid follows [SemVer 2.0.0](https://semver.org/) from v1.0.0 onwards.
This document spells out what counts as a breaking change so adopters
can pin with confidence.

## Versions

| Increment | Trigger                                                            |
| --------- | ------------------------------------------------------------------ |
| **Major** | Any breaking change to a `@public` symbol or wire-protocol type    |
| **Minor** | Adding a `@public` or `@beta` export; any `@beta` change           |
| **Patch** | Bug fixes that don't change the API surface                        |

Anything tagged `@internal` is out of scope. See
[SURFACE.md](./SURFACE.md) for what carries which tag.

## What counts as breaking

### Always breaking (require major bump)

- Removing a `@public` named export
- Renaming a `@public` named export (without keeping the old name as
  a `@deprecated` alias)
- Changing the type signature of a `@public` function in a way that
  rejects previously-valid callers
- Adding a **required** parameter to a `@public` function
- Adding a **required** field to a `@public` input type
- Changing the runtime behavior of a `@public` function in a way that
  produces different output for the same input
- Tightening a `@public` runtime constraint (e.g., a precondition that
  used to be a warning becomes a throw)
- Bumping `PROTOCOL_VERSION` in `@onegrid/protocol`
- Increasing the minimum Node / pnpm / browser version stated in the
  package's `engines` field
- Removing or renaming a CSS custom property in
  `@onegrid/tokens`'s color or density catalogs
- Changing the WGSL struct layout that
  `@onegrid/webgpu-render`'s `packCells` produces

### Always non-breaking (minor or patch)

- Adding a new `@public` named export
- Adding an **optional** parameter to a `@public` function
- Adding an **optional** field to a `@public` input type
- Adding a new method to a `@public` class
- Adding a new error code to a named error union (the union itself is
  exported; new members are additive)
- Internal performance improvements with no observable side effects
- Renaming a `@beta` export (documented in CHANGELOG)

### Gray areas (case-by-case; documented in CHANGELOG)

- Tightening type constraints in TypeScript when the runtime
  guarantee already enforced them. Typing was the bug.
- Re-ordering enum values where ordering had no documented meaning
- Reducing the size of an exported buffer constant when the change
  preserves the documented invariant

When in doubt: **major**. Adopter trust is the asset.

## What's covered

Every package published under the `@onegrid/*` scope and the
convenience umbrella `onegrid` follows this policy from their
**v1.0.0** release onward. Packages currently `< v1.0.0` are
pre-stability — breaking changes allowed at any time, called out
in the changelog.

## What's NOT covered

- **Demo apps** (`apps/playground`, `apps/benchmarks`,
  `apps/ssrm-mock-server`, `apps/docs`) — these are not published;
  contents may change in any release.
- **Internal scripts** (`scripts/*.mjs`) — used by CI, not consumer-
  facing.
- **Bundle size** — we hold gzipped budgets per package, but the
  exact byte count is not part of the contract. See
  `docs/bundle-budgets.md` for the gate.

## Deprecation lifecycle

When we plan to remove a `@public` symbol:

1. **Mark `@deprecated`** in the source. Add a `[OG_DEPRECATED_*]`
   console.warn on first use (once per session, keyed by symbol).
2. **Document the replacement** in the JSDoc + in CHANGELOG.
3. **Wait at least one minor version cycle** (so adopters who pin
   `^1.x.y` get a warning before the next major).
4. **Remove in the next major.** Note in the major's release
   notes.

Special case: security-driven removals can skip step 3 and ship
in a patch release. The advisory CVE link lives in CHANGELOG.

## Wire-protocol stability

`@onegrid/protocol`'s `PROTOCOL_VERSION` is currently `"0.0.1"` —
pre-v1.0.0. When oneGrid v1.0.0 ships, the protocol version
locks to `"1.0.0"`. Any change to:

- `BlockRequest` / `BlockResponse` shape
- `RowDiff` / `ResyncRequest` / `ResyncResponse` shape
- `KeysetCursor` codec
- Sort / filter / grouping / pivot / aggregation models

… requires bumping `PROTOCOL_VERSION` and is automatically a
breaking change for every adapter that speaks the protocol. CDC
adapters MAY refuse to subscribe when client + server protocol
versions differ.

## Pinning strategy

- For production code: pin to a range with a fixed major
  (`^1.0.0`).
- For libraries that depend on `@onegrid/*`: declare a peer
  dependency on a `^1.0.0` range. Don't pin a minor.
- For framework adapters (`@onegrid/react`, etc.): version-lock to
  their underlying `@onegrid/core` major.

## Pre-v1.0.0 versions

Everything published under `v0.x.y` is pre-stability. **All `0.x`
releases may contain breaking changes.** Adopters should pin
exact versions (`0.0.11`, not `^0.0.11`) and read the changelog
between bumps.

This policy goes into effect at v1.0.0.

## Audit trail

The `docs/api/` directory holds auto-generated `.api.md` reports
per package (one per `@onegrid/*` package). CI compares the diff
against `main`; PR comments surface every public-surface change.
The diff IS the change log for the API surface.
