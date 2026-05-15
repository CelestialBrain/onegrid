import { describe, it, expect, vi } from 'vitest';
import {
  buildPrompt,
  parseLlmResponse,
  interpretIntent,
  parseIntentHeuristic,
  type LlmClient,
} from '../index.js';
import type { ColumnSchema } from '@onegrid/protocol';

const schema: ColumnSchema[] = [
  { id: 'id', type: 'int32' },
  { id: 'name', type: 'utf8' },
  { id: 'amount', type: 'float64' },
  { id: 'status', type: 'utf8' },
];

describe('buildPrompt', () => {
  it('lists every column with its type', () => {
    const prompt = buildPrompt('show me high-value rows', schema);
    expect(prompt).toContain('- id (int32');
    expect(prompt).toContain('- amount (float64');
    expect(prompt).toContain('show me high-value rows');
  });
});

describe('parseLlmResponse', () => {
  it('parses a single sort intent', () => {
    const r = parseLlmResponse(
      JSON.stringify({
        intents: [
          { kind: 'sort', sort: [{ columnId: 'amount', direction: 'desc' }] },
        ],
      }),
      schema,
    );
    expect(r.intents).toHaveLength(1);
    expect(r.intents[0]).toEqual({
      kind: 'sort',
      sort: [{ columnId: 'amount', direction: 'desc' }],
    });
  });

  it('parses a comparison filter intent', () => {
    const r = parseLlmResponse(
      JSON.stringify({
        intents: [
          {
            kind: 'filter',
            filter: { type: 'comparison', columnId: 'amount', op: 'gte', value: 100 },
          },
        ],
      }),
      schema,
    );
    expect(r.intents).toHaveLength(1);
  });

  it('parses a nested logical filter', () => {
    const r = parseLlmResponse(
      JSON.stringify({
        intents: [
          {
            kind: 'filter',
            filter: {
              type: 'logical',
              op: 'and',
              filters: [
                { type: 'comparison', columnId: 'amount', op: 'gte', value: 100 },
                { type: 'comparison', columnId: 'status', op: 'eq', value: 'active' },
              ],
            },
          },
        ],
      }),
      schema,
    );
    expect(r.intents).toHaveLength(1);
    if (r.intents[0]?.kind === 'filter') {
      expect(r.intents[0].filter.type).toBe('logical');
    }
  });

  it('strips ```json code fences', () => {
    const wrapped = '```json\n' + JSON.stringify({ intents: [], explanation: 'ok' }) + '\n```';
    const r = parseLlmResponse(wrapped, schema);
    expect(r.explanation).toBe('ok');
  });

  it('rejects unknown columns', () => {
    expect(() =>
      parseLlmResponse(
        JSON.stringify({
          intents: [{ kind: 'sort', sort: [{ columnId: 'bogus', direction: 'asc' }] }],
        }),
        schema,
      ),
    ).toThrow(/OG_AI_INVALID_SORT_FIELD/);
  });

  it('rejects unknown filter operators', () => {
    expect(() =>
      parseLlmResponse(
        JSON.stringify({
          intents: [
            {
              kind: 'filter',
              filter: { type: 'comparison', columnId: 'amount', op: 'bogus', value: 1 },
            },
          ],
        }),
        schema,
      ),
    ).toThrow(/OG_AI_INVALID_FILTER/);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseLlmResponse('not json', schema)).toThrow(/OG_AI_INVALID_JSON/);
  });

  it('rejects unknown intent kinds', () => {
    expect(() =>
      parseLlmResponse(JSON.stringify({ intents: [{ kind: 'lol' }] }), schema),
    ).toThrow(/OG_AI_INVALID_INTENT/);
  });
});

describe('interpretIntent', () => {
  it('routes through buildPrompt + LlmClient + parseLlmResponse', async () => {
    const llm: LlmClient = {
      complete: vi.fn(async () =>
        JSON.stringify({
          intents: [{ kind: 'sort', sort: [{ columnId: 'name', direction: 'asc' }] }],
          explanation: 'sorting alphabetically',
        }),
      ),
    };
    const r = await interpretIntent('sort alphabetically', schema, llm);
    expect(llm.complete).toHaveBeenCalledTimes(1);
    expect(r.intents).toHaveLength(1);
    expect(r.explanation).toBe('sorting alphabetically');
  });
});

describe('parseIntentHeuristic — no LLM required', () => {
  it('parses "sort by amount desc"', () => {
    const r = parseIntentHeuristic('sort by amount desc', schema);
    expect(r.intents[0]).toEqual({
      kind: 'sort',
      sort: [{ columnId: 'amount', direction: 'desc' }],
    });
  });

  it('parses "sort by name" with default asc', () => {
    const r = parseIntentHeuristic('sort by name', schema);
    expect(r.intents[0]).toEqual({
      kind: 'sort',
      sort: [{ columnId: 'name', direction: 'asc' }],
    });
  });

  it('parses "amount >= 100"', () => {
    const r = parseIntentHeuristic('amount >= 100', schema);
    if (r.intents[0]?.kind === 'filter' && r.intents[0].filter.type === 'comparison') {
      expect(r.intents[0].filter.op).toBe('gte');
      expect(r.intents[0].filter.value).toBe(100);
    }
  });

  it('parses "status = active"', () => {
    const r = parseIntentHeuristic('status = active', schema);
    if (r.intents[0]?.kind === 'filter' && r.intents[0].filter.type === 'comparison') {
      expect(r.intents[0].filter.op).toBe('eq');
      expect(r.intents[0].filter.value).toBe('active');
    }
  });

  it('returns empty intents when nothing matches', () => {
    const r = parseIntentHeuristic('blah blah blah', schema);
    expect(r.intents).toHaveLength(0);
  });

  it('ignores unknown columns', () => {
    const r = parseIntentHeuristic('sort by bogus asc', schema);
    expect(r.intents).toHaveLength(0);
  });
});
