// =============================================================================
// @onegrid/plugin-kit
//
// CodeMirror-6-style extension framework for oneGrid. Facets combine many
// inputs into one output. Compartments swap a sub-extension at runtime
// without rebuilding the whole tree. Registries provide id-keyed lookup
// for things like per-column cellRenderers.
//
// Design notes:
//  - Plugins return opaque Extension values. The grid never inspects them
//    structurally — it just resolves them through a PluginState.
//  - Precedence is explicit. CodeMirror semantics: highest > high > default
//    > low > lowest, then registration order within a tier.
//  - PluginContext is narrow on purpose. No DOM/canvas access — plugins
//    should be portable across server and worker boundaries.
//  - interfaceVersion is a single integer that bumps when the plugin/core
//    contract changes. Plugins declare the version they were authored
//    against; loading a plugin from a mismatched version throws early.
// =============================================================================

import type { ColumnType, Schema } from '@onegrid/protocol';

/**
 * Current plugin/core interface version. Bump on breaking changes.
 * @public
 */
export const INTERFACE_VERSION = 1 as const;

// -----------------------------------------------------------------------------
// Extension / Facet / Compartment primitives
// -----------------------------------------------------------------------------

/**
 * Opaque extension marker. Plugins return these; nothing else creates them.
 * @public
 */
export type Extension = ExtensionNode | readonly Extension[];

interface ExtensionNode {
  readonly __og_ext: true;
  readonly facet?: Facet<unknown, unknown>;
  readonly value?: unknown;
  readonly compartment?: Compartment;
  readonly inner?: Extension;
  readonly precedence: number;
  readonly seq: number;
}

let extensionSeq = 0;

/**
 * Precedence tiers. Lower number = higher precedence (resolved first).
 * @public
 */
export const Precedence = {
  highest: 0,
  high: 1,
  default: 2,
  low: 3,
  lowest: 4,
} as const;
/** @public */
export type PrecedenceLevel = (typeof Precedence)[keyof typeof Precedence];

function withPrecedence(ext: Extension, level: PrecedenceLevel): Extension {
  if (Array.isArray(ext)) {
    return ext.map((e) => withPrecedence(e, level));
  }
  const node = ext as ExtensionNode;
  return { ...node, precedence: level, seq: extensionSeq++ };
}

/**
 * Re-tag an extension subtree with a different precedence level.
 * @public
 */
export const precedence = {
  highest: (ext: Extension): Extension => withPrecedence(ext, Precedence.highest),
  high: (ext: Extension): Extension => withPrecedence(ext, Precedence.high),
  low: (ext: Extension): Extension => withPrecedence(ext, Precedence.low),
  lowest: (ext: Extension): Extension => withPrecedence(ext, Precedence.lowest),
};

/** @public */
export interface FacetConfig<Input, Output> {
  /** Reduce all registered inputs into a single output. Default: array. */
  readonly combine?: (inputs: readonly Input[]) => Output;
  /** Equality check on outputs — skip downstream invalidation if unchanged. */
  readonly compare?: (a: Output, b: Output) => boolean;
  /** Optional debug label — shows up in error messages. */
  readonly label?: string;
}

/**
 * A typed combination point. Plugins register `Input` values via `facet.of(v)`;
 * `state.facet(facet)` returns the combined `Output`.
 * @public
 */
export class Facet<Input, Output = readonly Input[]> {
  private constructor(
    readonly id: symbol,
    readonly config: FacetConfig<Input, Output>,
  ) {}

  static define<I, O = readonly I[]>(config: FacetConfig<I, O> = {}): Facet<I, O> {
    return new Facet(Symbol(config.label ?? 'facet'), config);
  }

  of(value: Input): Extension {
    return {
      __og_ext: true,
      facet: this as unknown as Facet<unknown, unknown>,
      value,
      precedence: Precedence.default,
      seq: extensionSeq++,
    };
  }

  /** Internal: combine raw inputs into the typed Output. */
  combine(inputs: readonly Input[]): Output {
    if (this.config.combine) return this.config.combine(inputs);
    return inputs as unknown as Output;
  }
}

/**
 * Swappable extension slot. Wrap a sub-extension in a Compartment, then
 * reconfigure later without rebuilding the whole state tree. Used by
 * theme/density/locale swaps.
 * @public
 */
export class Compartment {
  readonly id = Symbol('compartment');

  of(ext: Extension): Extension {
    return {
      __og_ext: true,
      compartment: this,
      inner: ext,
      precedence: Precedence.default,
      seq: extensionSeq++,
    };
  }

  /** Build a replacement extension for use in `state.reconfigure({ replace })`. */
  reconfigure(ext: Extension): Extension {
    return this.of(ext);
  }

  /** Read this compartment's current inner extension from a state. */
  get(state: PluginState): Extension | undefined {
    return state.compartments.get(this);
  }
}

// -----------------------------------------------------------------------------
// PluginState — the resolved tree
// -----------------------------------------------------------------------------

/** @public */
export interface PluginStateConfig {
  readonly extensions: readonly Extension[];
  readonly interfaceVersion?: number;
}

/** @public */
export interface ReconfigureOptions {
  /** Append new extensions. */
  readonly append?: readonly Extension[];
  /** Swap compartments. */
  readonly replace?: ReadonlyMap<Compartment, Extension>;
}

interface ResolvedInputs {
  readonly byFacet: Map<symbol, unknown[]>;
}

/** @public */
export class PluginState {
  /** Internal: compartment → its inner extension, for `Compartment.get`. */
  readonly compartments: ReadonlyMap<Compartment, Extension>;

  private constructor(
    readonly interfaceVersion: number,
    private readonly resolved: ResolvedInputs,
    private readonly facetCache: Map<symbol, unknown>,
    compartments: ReadonlyMap<Compartment, Extension>,
    readonly rootExtensions: readonly Extension[],
  ) {
    this.compartments = compartments;
  }

  static create(config: PluginStateConfig): PluginState {
    const version = config.interfaceVersion ?? INTERFACE_VERSION;
    assertInterfaceVersion(version);
    const { resolved, compartments } = resolveExtensions(config.extensions);
    return new PluginState(
      version,
      resolved,
      new Map(),
      compartments,
      config.extensions,
    );
  }

  /** Read the combined output of a facet. Memoized per state. */
  facet<I, O>(facet: Facet<I, O>): O {
    const cached = this.facetCache.get(facet.id);
    if (cached !== undefined) return cached as O;
    const inputs = (this.resolved.byFacet.get(facet.id) ?? []) as readonly I[];
    const out = facet.combine(inputs);
    this.facetCache.set(facet.id, out);
    return out;
  }

  /**
   * Produce a new state with appended extensions and/or compartment swaps.
   * Re-resolves the tree; cached facet outputs are dropped (cheap — facets
   * are pure functions of the input list).
   */
  reconfigure(opts: ReconfigureOptions): PluginState {
    const nextRoots: Extension[] = [];
    for (const ext of this.rootExtensions) {
      nextRoots.push(replaceCompartments(ext, opts.replace));
    }
    if (opts.append) nextRoots.push(...opts.append);
    return PluginState.create({
      extensions: nextRoots,
      interfaceVersion: this.interfaceVersion,
    });
  }
}

function replaceCompartments(
  ext: Extension,
  replace: ReadonlyMap<Compartment, Extension> | undefined,
): Extension {
  if (!replace || replace.size === 0) return ext;
  if (Array.isArray(ext)) return ext.map((e) => replaceCompartments(e, replace));
  const node = ext as ExtensionNode;
  if (node.compartment && replace.has(node.compartment)) {
    const next = replace.get(node.compartment)!;
    return {
      ...node,
      inner: next,
      seq: extensionSeq++,
    };
  }
  if (node.inner) {
    return { ...node, inner: replaceCompartments(node.inner, replace) };
  }
  return ext;
}

function resolveExtensions(extensions: readonly Extension[]): {
  resolved: ResolvedInputs;
  compartments: Map<Compartment, Extension>;
} {
  const flat: ExtensionNode[] = [];
  const compartments = new Map<Compartment, Extension>();
  const visit = (ext: Extension): void => {
    if (Array.isArray(ext)) {
      for (const e of ext) visit(e);
      return;
    }
    const node = ext as ExtensionNode;
    if (node.compartment && node.inner) {
      compartments.set(node.compartment, node.inner);
      visit(node.inner);
      return;
    }
    if (node.facet) flat.push(node);
  };
  for (const ext of extensions) visit(ext);
  // Stable sort: precedence ASC, then seq ASC.
  flat.sort((a, b) => a.precedence - b.precedence || a.seq - b.seq);
  // Auto-dedup by (facet, value identity).
  const byFacet = new Map<symbol, unknown[]>();
  const seen = new Map<symbol, Set<unknown>>();
  for (const node of flat) {
    if (!node.facet) continue;
    const id = node.facet.id;
    let arr = byFacet.get(id);
    if (!arr) {
      arr = [];
      byFacet.set(id, arr);
    }
    let dedup = seen.get(id);
    if (!dedup) {
      dedup = new Set();
      seen.set(id, dedup);
    }
    if (dedup.has(node.value)) continue;
    dedup.add(node.value);
    arr.push(node.value);
  }
  return { resolved: { byFacet }, compartments };
}

/** @public */
export function assertInterfaceVersion(version: number): void {
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(
      `[OG_PLUGIN_INTERFACE_VERSION] expected positive integer, got ${String(version)}`,
    );
  }
  if (version !== INTERFACE_VERSION) {
    throw new Error(
      `[OG_PLUGIN_INTERFACE_VERSION] plugin built against interface v${String(version)} but core is v${String(INTERFACE_VERSION)}`,
    );
  }
}

// -----------------------------------------------------------------------------
// PluginContext — narrow surface plugins are allowed to touch
// -----------------------------------------------------------------------------

/** @public */
export interface PluginContext {
  readonly interfaceVersion: number;
  readonly facet: <I, O>(facet: Facet<I, O>) => O;
  /** Resolve a registry entry by id. Returns `undefined` if unregistered. */
  readonly resolve: <T>(registry: PluginRegistry<T>, id: string) => T | undefined;
}

/** @public */
export function createPluginContext(state: PluginState): PluginContext {
  return {
    interfaceVersion: state.interfaceVersion,
    facet: (f) => state.facet(f),
    resolve: (registry, id) => registry.resolve(state, id),
  };
}

// -----------------------------------------------------------------------------
// Keyed registries — for id-based lookup (cellRenderer per colId, etc.)
// -----------------------------------------------------------------------------

/**
 * A keyed plugin registry. Backed by a Facet whose combine step folds
 * `{ id, value }` registrations into a `Map<string, T>`.
 * @public
 */
export class PluginRegistry<T> {
  readonly facet: Facet<{ readonly id: string; readonly value: T }, ReadonlyMap<string, T>>;

  constructor(label: string) {
    this.facet = Facet.define<
      { readonly id: string; readonly value: T },
      ReadonlyMap<string, T>
    >({
      label,
      combine: (entries) => {
        const map = new Map<string, T>();
        for (const e of entries) {
          if (!map.has(e.id)) map.set(e.id, e.value);
        }
        return map;
      },
      compare: (a, b) => a === b,
    });
  }

  register(id: string, value: T): Extension {
    return this.facet.of({ id, value });
  }

  resolve(state: PluginState, id: string): T | undefined {
    return state.facet(this.facet).get(id);
  }

  all(state: PluginState): ReadonlyMap<string, T> {
    return state.facet(this.facet);
  }
}

// -----------------------------------------------------------------------------
// Ten domain registries
// -----------------------------------------------------------------------------

/** @public */
export interface CellRendererPlugin {
  readonly render: (cell: CellRenderInput) => string | { html: string };
}
/** @public */
export interface CellRenderInput {
  readonly value: unknown;
  readonly rowIndex: number;
  readonly columnId: string;
  readonly columnType: ColumnType;
}
/** @public */
export const cellRendererRegistry = new PluginRegistry<CellRendererPlugin>('cellRenderer');

/** @public */
export interface CellEditorPlugin {
  readonly mount: (ctx: CellEditorMountInput) => CellEditorHandle;
}
/** @public */
export interface CellEditorMountInput {
  readonly initialValue: unknown;
  readonly columnId: string;
  readonly columnType: ColumnType;
}
/** @public */
export interface CellEditorHandle {
  readonly commit: () => unknown;
  readonly cancel: () => void;
  readonly element: () => HTMLElement | null;
}
/** @public */
export const cellEditorRegistry = new PluginRegistry<CellEditorPlugin>('cellEditor');

/** @public */
export interface ExporterPlugin {
  readonly mimeType: string;
  readonly extension: string;
  readonly export: (input: ExportInput) => Uint8Array | string | Promise<Uint8Array | string>;
}
/** @public */
export interface ExportInput {
  readonly rows: ReadonlyArray<ReadonlyArray<unknown>>;
  readonly schema: Schema;
}
/** @public */
export const exporterRegistry = new PluginRegistry<ExporterPlugin>('exporter');

/** @public */
export interface DataSourcePlugin {
  readonly kind: string;
}
/** @public */
export const dataSourceRegistry = new PluginRegistry<DataSourcePlugin>('dataSource');

/** @public */
export interface ThemePlugin {
  readonly tokens: Readonly<Record<string, string>>;
  readonly inheritsFrom?: string;
}
/** @public */
export const themeRegistry = new PluginRegistry<ThemePlugin>('theme');

/** @public */
export interface FormulaFunctionPlugin {
  readonly arity: number | 'variadic';
  readonly evaluate: (args: readonly unknown[]) => unknown;
  readonly pure?: boolean;
}
/** @public */
export const formulaFunctionRegistry = new PluginRegistry<FormulaFunctionPlugin>('formulaFunction');

/** @public */
export interface AggregatorPlugin {
  readonly init: () => unknown;
  readonly step: (acc: unknown, value: unknown) => unknown;
  readonly finalize: (acc: unknown) => unknown;
}
/** @public */
export const aggregatorRegistry = new PluginRegistry<AggregatorPlugin>('aggregator');

/** @public */
export interface FilterOperatorPlugin {
  readonly arity: 1 | 2;
  readonly match: (cellValue: unknown, operand: unknown) => boolean;
  readonly sqlTemplate?: (col: string, params: readonly string[]) => string;
}
/** @public */
export const filterOperatorRegistry = new PluginRegistry<FilterOperatorPlugin>('filterOperator');

/** @public */
export interface ColumnToolPlugin {
  readonly label: string;
  readonly icon?: string;
  readonly onActivate: (columnId: string) => void;
}
/** @public */
export const columnToolRegistry = new PluginRegistry<ColumnToolPlugin>('columnTool');

/** @public */
export interface I18nCatalogPlugin {
  readonly locale: string;
  readonly messages: Readonly<Record<string, string>>;
}
/** @public */
export const i18nCatalogRegistry = new PluginRegistry<I18nCatalogPlugin>('i18nCatalog');

// -----------------------------------------------------------------------------
// Convenience: build a plugin module
// -----------------------------------------------------------------------------

/** @public */
export interface PluginManifest {
  readonly name: string;
  readonly interfaceVersion: number;
  readonly extensions: readonly Extension[];
}

/**
 * Author-facing helper. Asserts interface compat at module load.
 * @public
 */
export function definePlugin(manifest: PluginManifest): PluginManifest {
  assertInterfaceVersion(manifest.interfaceVersion);
  return manifest;
}
