// =============================================================================
// @onegrid/formula — v1.1.0 wave 9: web + CUBE.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { getFunction } from '../functions';
import { NAME_ERROR } from '../errors';

const call = (name: string, args: unknown[]): unknown => {
  const fn = getFunction(name);
  if (!fn) throw new Error(`function ${name} not registered`);
  return fn(args);
};

describe('@onegrid/formula — ENCODEURL / HYPERLINK', () => {
  it('ENCODEURL percent-encodes', () => {
    expect(call('ENCODEURL', ['hello world'])).toBe('hello%20world');
    expect(call('ENCODEURL', ['a+b&c'])).toBe('a%2Bb%26c');
  });

  it('HYPERLINK returns friendly_name when given, else url', () => {
    expect(call('HYPERLINK', ['https://example.com', 'Click'])).toBe('Click');
    expect(call('HYPERLINK', ['https://example.com'])).toBe('https://example.com');
  });
});

describe('@onegrid/formula — CUBE.* + WEBSERVICE + FILTERXML are #NAME! stubs', () => {
  for (const name of [
    'CUBEKPIMEMBER',
    'CUBEMEMBER',
    'CUBEMEMBERPROPERTY',
    'CUBERANKEDMEMBER',
    'CUBESET',
    'CUBESETCOUNT',
    'CUBEVALUE',
    'WEBSERVICE',
    'FILTERXML',
  ]) {
    it(`${name} returns #NAME!`, () => {
      expect(call(name, [])).toBe(NAME_ERROR);
    });
  }
});
