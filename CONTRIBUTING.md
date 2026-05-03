# Contributing to oneGrid

Thanks for considering a contribution. oneGrid is MIT-licensed and intentionally welcomes PRs.

## Development setup

```bash
git clone <your-fork-url>
cd onegrid
pnpm install
pnpm build
pnpm test
```

Requires Node 20.10+ and pnpm 9+. The repo uses [Turborepo](https://turbo.build) to coordinate package builds, [tsup](https://tsup.egoist.dev) for bundling, [Vitest](https://vitest.dev) for tests, and [Changesets](https://github.com/changesets/changesets) for versioning.

## Workflow

1. Pick or open an issue. For substantial changes, discuss the approach in the issue first — saves rework.
2. Create a branch off `main`.
3. Make your change. Keep PRs focused: one feature or fix per PR.
4. Run `pnpm lint && pnpm typecheck && pnpm test` before pushing.
5. Add a changeset: `pnpm changeset` — pick affected packages, choose semver bump, write a one-line summary.
6. Open a PR. Describe what changed and why.

## Coding conventions

- TypeScript strict mode is non-negotiable. `any` is forbidden by ESLint.
- No `// @ts-ignore` or `// @ts-nocheck` without an explanatory comment that points to a tracked issue.
- Public APIs require JSDoc. Internal helpers do not need comments unless the *why* is non-obvious.
- Follow the existing module layout: each package exposes a single `src/index.ts` barrel; deeper modules live under `src/<topic>/`.

## Architectural guardrails

- `@onegrid/protocol` is types-only. Never put runtime code there.
- `@onegrid/core` must remain framework-agnostic. No `react`, `vue`, etc. imports.
- Adapter packages should be thin. If logic creeps into an adapter, the abstraction in core is wrong — fix the core, not the adapter.
- `Array<Object>` is never the right data structure for the row store. Stay columnar.
- `@onegrid/data` owns sort/filter/group/pivot/aggregate over `ColumnTable`. New analytical primitives go here, not in core.
- `@onegrid/webgpu` is an optional accelerator. Every GPU kernel ships a CPU fallback with the same signature so callers can pick at runtime.
- New ORM/database adapters live under `packages/adapters/` and depend only on `@onegrid/protocol`.
- New backing engines (DuckDB, future ones) live as their own package and bridge into `@onegrid/ssrm`'s `DataSource` shape so they reuse the existing block cache + Arrow path.

## Performance

oneGrid targets 10M+ row workloads. Every PR that touches a hot path (rendering, sort, filter, scroll, formula recompute) should include a benchmark in `apps/benchmarks` and a before/after measurement in the PR description.

Bundle size is enforced via `size-limit` in CI. PRs that bloat any package fail until justified.

## License

Contributions are under MIT. By submitting a PR you agree your code is MIT-licensed and you have the right to contribute it.
