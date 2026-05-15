# @onegrid/ai

Natural-language → typed grid intent. The grid never calls an LLM
directly; this package owns the prompt shape, the JSON schema, and the
response validation. You bring the model call.

## Why BYO-LLM

Pinning a specific SDK (Anthropic, OpenAI, Vercel AI, etc.) forces every
adopter onto your choice. `@onegrid/ai` takes a `{ complete(prompt)
→ string }` and that's it — wire it to Claude, GPT, Gemini, a local
llama.cpp, an eval mock, anything.

## Intents

```ts
type Intent =
  | { kind: 'filter'; filter: FilterNode }
  | { kind: 'sort'; sort: SortField[] }
  | { kind: 'formula'; targetColumn: string; expression: string }
  | { kind: 'mutation'; rowKey, columnId, value };
```

All four cleanly compose with the v0.0.8 mutator, the v0.0.11 MCP
server, and the standard grid set-sort / set-filter API.

## Quickstart

```ts
import { interpretIntent } from '@onegrid/ai';

const llm = {
  async complete(prompt: string) {
    const r = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    return r.content[0]!.text;
  },
};

const result = await interpretIntent(
  'show me orders above $1000 sorted newest first',
  columns,
  llm,
);
// result.intents → [
//   { kind: 'filter', filter: { type:'comparison', columnId:'amount', op:'gt', value:1000 } },
//   { kind: 'sort',   sort: [{ columnId: 'created_at', direction: 'desc' }] },
// ]
```

Pass the resulting intents to your normal grid plumbing — they're
typed against `@onegrid/protocol`'s `FilterNode` / `SortField`, so no
extra translation needed.

## No-LLM fallback

`parseIntentHeuristic(text, columns)` covers obvious cases with regex —
useful when you want to skip the model latency for clearly-structured
input:

```
sort by amount desc        → sort intent
amount >= 100              → filter intent (gte)
status = active            → filter intent (eq)
name contains "smith"      → filter intent (contains)
```

Unrecognized input returns `{ intents: [] }`. Adopters route to
`interpretIntent` (with an LLM) as the fallback.

## Validation

`parseLlmResponse` rejects:

- Malformed JSON → `[OG_AI_INVALID_JSON]`
- Unknown intent kinds → `[OG_AI_INVALID_INTENT]`
- Unknown column ids → `[OG_AI_INVALID_SORT_FIELD]` / `[OG_AI_INVALID_FILTER]`
- Unknown filter operators → `[OG_AI_INVALID_FILTER]`

Throws are deliberate — don't trust a model to invent column names or
operators; surface "I didn't understand that" to the user instead.

## License

MIT
