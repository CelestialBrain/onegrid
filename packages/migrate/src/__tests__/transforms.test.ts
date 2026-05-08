import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { transform } from '../index';

const fixture = (name: string): string =>
  readFileSync(join(__dirname, '__fixtures__', name), 'utf8');

describe('ag-grid transformer', () => {
  it('renames the simple props (field/headerName/width/valueFormatter)', () => {
    const { output } = transform(fixture('ag-grid.input.tsx'), { source: 'ag-grid' });
    expect(output).toContain("id: 'firstName'");
    expect(output).toContain("displayName: 'First Name'");
    expect(output).toContain('width: 130');
    expect(output).toContain('format:');
    expect(output).toContain('renderer:');
    // Field name no longer present (renamed everywhere it appeared).
    expect(output).not.toContain("field: 'firstName'");
  });

  it('flags ambiguous props with TODO comments', () => {
    const { output, todos } = transform(fixture('ag-grid.input.tsx'), { source: 'ag-grid' });
    expect(todos.length).toBeGreaterThan(0);
    // Each ambiguous prop survives in the output with a leading TODO line.
    expect(output).toContain('TODO(@onegrid/migrate)');
    expect(todos.some((t) => t.message.includes('pinned'))).toBe(true);
    expect(todos.some((t) => t.message.includes('editable'))).toBe(true);
    expect(todos.some((t) => t.message.includes('sortable'))).toBe(true);
  });

  it('leaves non-ColDef object literals untouched', () => {
    const input = `const config = { headerHeight: 32, foo: { bar: 1 } };`;
    const { output, todos } = transform(input, { source: 'ag-grid' });
    expect(output).toContain('headerHeight: 32');
    expect(todos).toEqual([]);
  });
});

describe('tanstack transformer', () => {
  it('renames accessorKey/header/size/cell', () => {
    const { output } = transform(fixture('tanstack.input.tsx'), { source: 'tanstack' });
    expect(output).toContain("id: 'firstName'");
    expect(output).toContain("displayName: 'First Name'");
    expect(output).toContain('width: 130');
    expect(output).toContain('renderer:');
    expect(output).not.toContain('accessorKey:');
    expect(output).not.toContain('header:');
  });

  it('flags enableSorting as a global concern', () => {
    const { todos } = transform(fixture('tanstack.input.tsx'), { source: 'tanstack' });
    expect(todos.some((t) => t.message.includes('enableSorting'))).toBe(true);
  });
});

describe('transform()', () => {
  it('throws on unknown source library', () => {
    expect(() =>
      transform('const x = 1;', {
        source: 'unknown' as unknown as 'ag-grid',
      }),
    ).toThrow(/Unknown source library/);
  });

  it('returns input unchanged when there are no matching object literals', () => {
    const input = `import { something } from 'somewhere';`;
    const { output, todos } = transform(input, { source: 'ag-grid' });
    expect(output).toBe(input);
    expect(todos).toEqual([]);
  });
});
