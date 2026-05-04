import { describe, expect, it } from 'vitest';
import {
  createDateEditor,
  createSelectEditor,
  createTextareaEditor,
} from '../editing/variants';

describe('createSelectEditor', () => {
  it('mounts a <select> with the given options', () => {
    const editor = createSelectEditor({
      options: [
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Beta' },
      ],
    });
    const inst = editor.mount({
      value: 'b',
      rowIndex: 0,
      columnId: 'x',
      displayText: 'b',
    });
    expect(inst.element.tagName).toBe('SELECT');
    expect(inst.element.children).toHaveLength(2);
    expect(inst.getValue()).toBe('b');
  });

  it('falls back to the first option when current value is not in the set', () => {
    const editor = createSelectEditor({
      options: [{ value: 'a' }, { value: 'b' }],
    });
    const inst = editor.mount({
      value: 'unknown',
      rowIndex: 0,
      columnId: 'x',
      displayText: 'unknown',
    });
    expect(inst.getValue()).toBe('a');
  });
});

describe('createDateEditor', () => {
  it('mounts an <input type="date"> seeded with the cell value', () => {
    const editor = createDateEditor();
    const inst = editor.mount({
      value: '2026-05-04',
      rowIndex: 0,
      columnId: 'd',
      displayText: '2026-05-04',
    });
    expect(inst.element.tagName).toBe('INPUT');
    expect((inst.element as HTMLInputElement).type).toBe('date');
    expect(inst.getValue()).toBe('2026-05-04');
  });

  it('extracts the date portion from an ISO datetime', () => {
    const editor = createDateEditor();
    const inst = editor.mount({
      value: '2026-05-04T10:30',
      rowIndex: 0,
      columnId: 'd',
      displayText: '2026-05-04 10:30',
    });
    expect(inst.getValue()).toBe('2026-05-04');
  });

  it('seeds empty for un-parseable input', () => {
    const editor = createDateEditor();
    const inst = editor.mount({
      value: 'not a date',
      rowIndex: 0,
      columnId: 'd',
      displayText: 'not a date',
    });
    expect(inst.getValue()).toBe('');
  });
});

describe('createTextareaEditor', () => {
  it('mounts a <textarea> with the given rows', () => {
    const editor = createTextareaEditor({ rows: 6 });
    const inst = editor.mount({
      value: 'hello\nworld',
      rowIndex: 0,
      columnId: 't',
      displayText: 'hello\nworld',
    });
    expect(inst.element.tagName).toBe('TEXTAREA');
    expect((inst.element as HTMLTextAreaElement).rows).toBe(6);
    expect(inst.getValue()).toBe('hello\nworld');
  });
});
