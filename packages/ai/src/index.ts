// =============================================================================
// @onegrid/ai
//
// Natural-language → typed grid intent. The grid never calls an LLM
// directly; this package owns the prompt structure, JSON schema, and
// response validation, and the host supplies the model call.
//
// Design notes:
//   - BYO-LLM: callers pass `{ complete(prompt) → string }` so we work
//     with Claude, GPT, local llama.cpp, mocks — anything.
//   - Output is strictly typed against oneGrid's protocol (SortField,
//     FilterNode). Invalid output is rejected, not coerced.
//   - The package is offline-friendly: a `parseIntent(text, schema)`
//     entry point uses regex heuristics for the common cases (filter by
//     value, sort by column) so adopters get a useful fallback before
//     they wire up an LLM.
// =============================================================================

import type {
  ColumnSchema,
  ComparisonFilter,
  ComparisonOperator,
  FilterNode,
  LogicalFilter,
  SortField,
} from '@onegrid/protocol';

// -----------------------------------------------------------------------------
// Intent shapes
// -----------------------------------------------------------------------------

/** @beta */
export interface FilterIntent {
  readonly kind: 'filter';
  readonly filter: FilterNode;
}

/** @beta */
export interface SortIntent {
  readonly kind: 'sort';
  readonly sort: ReadonlyArray<SortField>;
}

/** @beta */
export interface FormulaIntent {
  readonly kind: 'formula';
  /** Target column id (the column the formula populates). */
  readonly targetColumn: string;
  /** Formula expression. */
  readonly expression: string;
}

/** @beta */
export interface MutationIntent {
  readonly kind: 'mutation';
  readonly rowKey: string | number;
  readonly columnId: string;
  readonly value: unknown;
}

/** @beta */
export type Intent =
  | FilterIntent
  | SortIntent
  | FormulaIntent
  | MutationIntent;

/** @beta */
export interface IntentResult {
  readonly intents: ReadonlyArray<Intent>;
  /** Free-text explanation the LLM produced; useful for confirmation UIs. */
  readonly explanation?: string;
}

// -----------------------------------------------------------------------------
// LLM contract — BYO model
// -----------------------------------------------------------------------------

/** @beta */
export interface LlmClient {
  /**
   * Produce a single text completion. Implementations decide whether to
   * use streaming under the hood; this surface stays synchronous-shaped
   * for the prompt-response cycle.
   */
  readonly complete: (prompt: string, opts?: { readonly temperature?: number }) => Promise<string>;
}

// -----------------------------------------------------------------------------
// Prompt builder
// -----------------------------------------------------------------------------

/**
 * Build the structured prompt the LLM sees. Output is grammar-checked
 * by `parseLlmResponse`; system prompt steers the model toward strict
 * JSON.
 * @beta
 */
export function buildPrompt(
  text: string,
  schema: ReadonlyArray<ColumnSchema>,
): string {
  const columnList = schema
    .map((c) => `  - ${c.id} (${c.type}${c.nullable ? ', nullable' : ''})`)
    .join('\n');
  return [
    `You translate a user's natural-language request into structured grid intents.`,
    ``,
    `Grid columns:`,
    columnList,
    ``,
    `Supported intents (you may emit multiple in one response):`,
    `- filter: a tree of filter nodes (comparison or logical AND/OR/NOT).`,
    `  Comparison ops: eq, neq, lt, lte, gt, gte, in, notIn, contains, notContains, startsWith, endsWith, isNull, isNotNull, between, notBetween.`,
    `- sort: a list of { columnId, direction: 'asc'|'desc' }.`,
    `- formula: { targetColumn, expression } where expression is a spreadsheet formula.`,
    `- mutation: { rowKey, columnId, value } for a single-cell edit.`,
    ``,
    `Respond ONLY with valid JSON of the shape:`,
    `{ "intents": [<intent>, ...], "explanation": "<one-line>" }`,
    `where each <intent> has a "kind" field. No prose outside the JSON.`,
    ``,
    `User request: ${text}`,
  ].join('\n');
}

// -----------------------------------------------------------------------------
// Response parsing + validation
// -----------------------------------------------------------------------------

const COMPARISON_OPS: ReadonlySet<ComparisonOperator> = new Set([
  'eq', 'neq', 'lt', 'lte', 'gt', 'gte',
  'in', 'notIn',
  'contains', 'notContains',
  'startsWith', 'endsWith',
  'isNull', 'isNotNull',
  'between', 'notBetween',
]);

/**
 * Parse the LLM's text response and validate against the grid's
 * protocol. Throws on malformed JSON or schema violations — adopters
 * surface this to the user as "I didn't understand that".
 * @beta
 */
export function parseLlmResponse(
  text: string,
  schema: ReadonlyArray<ColumnSchema>,
): IntentResult {
  // Strip code fences if the model added them.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('[OG_AI_INVALID_JSON] LLM did not return valid JSON');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('[OG_AI_INVALID_SHAPE] response is not an object');
  }
  const root = parsed as { intents?: unknown; explanation?: unknown };
  if (!Array.isArray(root.intents)) {
    throw new Error('[OG_AI_INVALID_SHAPE] missing intents array');
  }
  const colIds = new Set(schema.map((c) => c.id));
  const intents = root.intents.map((i) => validateIntent(i, colIds));
  return {
    intents,
    ...(typeof root.explanation === 'string'
      ? { explanation: root.explanation }
      : {}),
  };
}

function validateIntent(raw: unknown, colIds: ReadonlySet<string>): Intent {
  if (!raw || typeof raw !== 'object') {
    throw new Error('[OG_AI_INVALID_INTENT] not an object');
  }
  const intent = raw as { kind?: string };
  switch (intent.kind) {
    case 'filter':
      return {
        kind: 'filter',
        filter: validateFilterNode((raw as { filter: unknown }).filter, colIds),
      };
    case 'sort': {
      const sort = (raw as { sort: unknown }).sort;
      if (!Array.isArray(sort)) {
        throw new Error('[OG_AI_INVALID_INTENT] sort must be an array');
      }
      const fields: SortField[] = sort.map((s) => validateSortField(s, colIds));
      return { kind: 'sort', sort: fields };
    }
    case 'formula': {
      const r = raw as { targetColumn?: unknown; expression?: unknown };
      if (typeof r.targetColumn !== 'string' || !colIds.has(r.targetColumn)) {
        throw new Error(
          `[OG_AI_INVALID_INTENT] formula.targetColumn unknown: ${String(r.targetColumn)}`,
        );
      }
      if (typeof r.expression !== 'string' || r.expression.length === 0) {
        throw new Error('[OG_AI_INVALID_INTENT] formula.expression must be a non-empty string');
      }
      return { kind: 'formula', targetColumn: r.targetColumn, expression: r.expression };
    }
    case 'mutation': {
      const r = raw as { rowKey?: unknown; columnId?: unknown; value?: unknown };
      if (r.rowKey === undefined) {
        throw new Error('[OG_AI_INVALID_INTENT] mutation.rowKey required');
      }
      if (typeof r.columnId !== 'string' || !colIds.has(r.columnId)) {
        throw new Error(
          `[OG_AI_INVALID_INTENT] mutation.columnId unknown: ${String(r.columnId)}`,
        );
      }
      return {
        kind: 'mutation',
        rowKey: r.rowKey as string | number,
        columnId: r.columnId,
        value: r.value,
      };
    }
    default:
      throw new Error(`[OG_AI_INVALID_INTENT] unknown kind '${String(intent.kind)}'`);
  }
}

function validateSortField(raw: unknown, colIds: ReadonlySet<string>): SortField {
  if (!raw || typeof raw !== 'object') {
    throw new Error('[OG_AI_INVALID_SORT_FIELD] not an object');
  }
  const r = raw as { columnId?: unknown; direction?: unknown };
  if (typeof r.columnId !== 'string' || !colIds.has(r.columnId)) {
    throw new Error(
      `[OG_AI_INVALID_SORT_FIELD] unknown columnId '${String(r.columnId)}'`,
    );
  }
  if (r.direction !== 'asc' && r.direction !== 'desc') {
    throw new Error(`[OG_AI_INVALID_SORT_FIELD] direction must be asc|desc`);
  }
  return { columnId: r.columnId, direction: r.direction };
}

function validateFilterNode(
  raw: unknown,
  colIds: ReadonlySet<string>,
): FilterNode {
  if (!raw || typeof raw !== 'object') {
    throw new Error('[OG_AI_INVALID_FILTER] not an object');
  }
  const r = raw as { type?: unknown };
  if (r.type === 'comparison') {
    const c = raw as Partial<ComparisonFilter>;
    if (typeof c.columnId !== 'string' || !colIds.has(c.columnId)) {
      throw new Error(`[OG_AI_INVALID_FILTER] unknown columnId '${String(c.columnId)}'`);
    }
    if (!c.op || !COMPARISON_OPS.has(c.op)) {
      throw new Error(`[OG_AI_INVALID_FILTER] unknown op '${String(c.op)}'`);
    }
    return c as ComparisonFilter;
  }
  if (r.type === 'logical') {
    const l = raw as Partial<LogicalFilter>;
    if (l.op !== 'and' && l.op !== 'or' && l.op !== 'not') {
      throw new Error(`[OG_AI_INVALID_FILTER] logical.op must be and|or|not`);
    }
    if (!Array.isArray(l.filters)) {
      throw new Error(`[OG_AI_INVALID_FILTER] logical.filters must be array`);
    }
    return {
      type: 'logical',
      op: l.op,
      filters: l.filters.map((f) => validateFilterNode(f, colIds)),
    };
  }
  throw new Error(`[OG_AI_INVALID_FILTER] unknown type '${String(r.type)}'`);
}

// -----------------------------------------------------------------------------
// Top-level entry
// -----------------------------------------------------------------------------

/**
 * End-to-end: build the prompt, call the LLM, parse + validate the
 * response. Throws on any structural problem; the caller decides
 * whether to retry, surface to the user, or fall back to a heuristic.
 * @beta
 */
export async function interpretIntent(
  text: string,
  schema: ReadonlyArray<ColumnSchema>,
  llm: LlmClient,
  opts?: { readonly temperature?: number },
): Promise<IntentResult> {
  const prompt = buildPrompt(text, schema);
  const response = await llm.complete(prompt, opts);
  return parseLlmResponse(response, schema);
}

// -----------------------------------------------------------------------------
// Heuristic fallback — no LLM required
// -----------------------------------------------------------------------------

/**
 * Best-effort regex-based intent parser. Covers the common cases:
 *
 *   "sort by <col> [asc|desc]"
 *   "filter <col> > <n>" / "<col> = <v>" / "<col> contains <s>"
 *   "set <col> to <v> for row <k>"
 *
 * Anything it doesn't recognize returns `{ intents: [] }`. Adopters
 * fall back to this when no LLM is configured OR when they want to
 * short-circuit obvious cases without paying the model latency.
 * @beta
 */
export function parseIntentHeuristic(
  text: string,
  schema: ReadonlyArray<ColumnSchema>,
): IntentResult {
  const colIds = new Set(schema.map((c) => c.id));
  const norm = text.trim();
  const intents: Intent[] = [];

  // sort by <col> [direction]
  const sortMatch = /^sort\s+by\s+(\w+)(?:\s+(asc|desc|ascending|descending))?\s*$/i.exec(norm);
  if (sortMatch && colIds.has(sortMatch[1]!)) {
    const dir = sortMatch[2]?.toLowerCase().startsWith('desc') ? 'desc' : 'asc';
    intents.push({
      kind: 'sort',
      sort: [{ columnId: sortMatch[1]!, direction: dir }],
    });
    return { intents };
  }

  // filter clauses
  const filterMatch = /^(?:filter\s+)?(\w+)\s*(>=|<=|>|<|=|!=|contains)\s*(.+)$/i.exec(norm);
  if (filterMatch && colIds.has(filterMatch[1]!)) {
    const col = filterMatch[1]!;
    const opStr = filterMatch[2]!;
    const rawVal = filterMatch[3]!.trim().replace(/^["']|["']$/g, '');
    const value: unknown = isNaN(Number(rawVal)) ? rawVal : Number(rawVal);
    const op: ComparisonOperator =
      opStr === '>=' ? 'gte'
      : opStr === '<=' ? 'lte'
      : opStr === '>' ? 'gt'
      : opStr === '<' ? 'lt'
      : opStr === '=' ? 'eq'
      : opStr === '!=' ? 'neq'
      : 'contains';
    intents.push({
      kind: 'filter',
      filter: { type: 'comparison', columnId: col, op, value },
    });
    return { intents };
  }

  return { intents };
}
