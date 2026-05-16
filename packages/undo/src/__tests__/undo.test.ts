import { describe, it, expect, vi } from 'vitest';
import { createUndoManager } from '../index.js';

interface CellEdit {
  readonly kind: 'cellEdit';
  readonly row: number;
  readonly col: string;
  readonly value: unknown;
}

describe('createUndoManager', () => {
  it('push then undo dispatches the inverse', () => {
    const apply = vi.fn();
    const u = createUndoManager<CellEdit>({ apply });
    u.push({
      kind: 'cellEdit',
      forward: { kind: 'cellEdit', row: 0, col: 'name', value: 'Bob' },
      inverse: { kind: 'cellEdit', row: 0, col: 'name', value: 'Alice' },
    });
    expect(u.canUndo()).toBe(true);
    expect(u.canRedo()).toBe(false);
    u.undo();
    expect(apply).toHaveBeenCalledWith({ kind: 'cellEdit', row: 0, col: 'name', value: 'Alice' });
    expect(u.canUndo()).toBe(false);
    expect(u.canRedo()).toBe(true);
  });

  it('redo dispatches the forward', () => {
    const apply = vi.fn();
    const u = createUndoManager<CellEdit>({ apply });
    u.push({
      kind: 'cellEdit',
      forward: { kind: 'cellEdit', row: 0, col: 'name', value: 'Bob' },
      inverse: { kind: 'cellEdit', row: 0, col: 'name', value: 'Alice' },
    });
    u.undo();
    apply.mockClear();
    u.redo();
    expect(apply).toHaveBeenCalledWith({ kind: 'cellEdit', row: 0, col: 'name', value: 'Bob' });
  });

  it('pushing a new entry drops the redo stack', () => {
    const u = createUndoManager<CellEdit>({ apply: () => {} });
    u.push({
      kind: 'cellEdit',
      forward: { kind: 'cellEdit', row: 0, col: 'name', value: 'A' },
      inverse: { kind: 'cellEdit', row: 0, col: 'name', value: '' },
    });
    u.undo();
    expect(u.canRedo()).toBe(true);
    u.push({
      kind: 'cellEdit',
      forward: { kind: 'cellEdit', row: 0, col: 'name', value: 'B' },
      inverse: { kind: 'cellEdit', row: 0, col: 'name', value: '' },
    });
    expect(u.canRedo()).toBe(false);
  });

  it('transaction bundles multiple pushes into ONE undo entry', () => {
    const apply = vi.fn();
    const u = createUndoManager<CellEdit>({ apply });
    u.transaction(
      () => {
        u.push({
          kind: 'cellEdit',
          forward: { kind: 'cellEdit', row: 0, col: 'name', value: 'A' },
          inverse: { kind: 'cellEdit', row: 0, col: 'name', value: '' },
        });
        u.push({
          kind: 'cellEdit',
          forward: { kind: 'cellEdit', row: 1, col: 'name', value: 'B' },
          inverse: { kind: 'cellEdit', row: 1, col: 'name', value: '' },
        });
        u.push({
          kind: 'cellEdit',
          forward: { kind: 'cellEdit', row: 2, col: 'name', value: 'C' },
          inverse: { kind: 'cellEdit', row: 2, col: 'name', value: '' },
        });
      },
      { kind: 'fillHandle', label: 'Fill range' },
    );
    expect(u.state().undoCount).toBe(1);
    expect(u.state().nextUndoLabel).toBe('Fill range');
    u.undo();
    // Inverses run in reverse order (3, 2, 1).
    expect(apply).toHaveBeenCalledTimes(3);
    expect(apply.mock.calls[0]?.[0]).toEqual({ kind: 'cellEdit', row: 2, col: 'name', value: '' });
    expect(apply.mock.calls[1]?.[0]).toEqual({ kind: 'cellEdit', row: 1, col: 'name', value: '' });
    expect(apply.mock.calls[2]?.[0]).toEqual({ kind: 'cellEdit', row: 0, col: 'name', value: '' });
  });

  it('redo of a transaction replays forwards in original order', () => {
    const apply = vi.fn();
    const u = createUndoManager<CellEdit>({ apply });
    u.transaction(() => {
      u.push({
        kind: 'cellEdit',
        forward: { kind: 'cellEdit', row: 0, col: 'name', value: 'A' },
        inverse: { kind: 'cellEdit', row: 0, col: 'name', value: '' },
      });
      u.push({
        kind: 'cellEdit',
        forward: { kind: 'cellEdit', row: 1, col: 'name', value: 'B' },
        inverse: { kind: 'cellEdit', row: 1, col: 'name', value: '' },
      });
    });
    u.undo();
    apply.mockClear();
    u.redo();
    expect(apply.mock.calls[0]?.[0]).toEqual({ kind: 'cellEdit', row: 0, col: 'name', value: 'A' });
    expect(apply.mock.calls[1]?.[0]).toEqual({ kind: 'cellEdit', row: 1, col: 'name', value: 'B' });
  });

  it('maxDepth drops oldest entries FIFO', () => {
    const u = createUndoManager<CellEdit>({ apply: () => {}, maxDepth: 3 });
    for (let i = 0; i < 5; i++) {
      u.push({
        kind: 'cellEdit',
        forward: { kind: 'cellEdit', row: i, col: 'name', value: `v${i}` },
        inverse: { kind: 'cellEdit', row: i, col: 'name', value: '' },
      });
    }
    expect(u.state().undoCount).toBe(3);
  });

  it('clear wipes both stacks', () => {
    const u = createUndoManager<CellEdit>({ apply: () => {} });
    u.push({
      kind: 'cellEdit',
      forward: { kind: 'cellEdit', row: 0, col: 'name', value: 'A' },
      inverse: { kind: 'cellEdit', row: 0, col: 'name', value: '' },
    });
    u.undo();
    expect(u.canUndo()).toBe(false);
    expect(u.canRedo()).toBe(true);
    u.clear();
    expect(u.canUndo()).toBe(false);
    expect(u.canRedo()).toBe(false);
  });

  it('onChange fires after every state-changing op', () => {
    const onChange = vi.fn();
    const u = createUndoManager<CellEdit>({ apply: () => {}, onChange });
    u.push({
      kind: 'cellEdit',
      forward: { kind: 'cellEdit', row: 0, col: 'name', value: 'A' },
      inverse: { kind: 'cellEdit', row: 0, col: 'name', value: '' },
    });
    u.undo();
    u.redo();
    u.clear();
    expect(onChange).toHaveBeenCalledTimes(4);
    expect(onChange.mock.calls[0]?.[0].canUndo).toBe(true);
    expect(onChange.mock.calls[1]?.[0].canUndo).toBe(false);
    expect(onChange.mock.calls[1]?.[0].canRedo).toBe(true);
    expect(onChange.mock.calls[3]?.[0].canUndo).toBe(false);
    expect(onChange.mock.calls[3]?.[0].canRedo).toBe(false);
  });

  it('undo / redo on empty stacks are safe no-ops returning null', () => {
    const u = createUndoManager<CellEdit>({ apply: () => {} });
    expect(u.undo()).toBeNull();
    expect(u.redo()).toBeNull();
  });
});

describe('bindKeyboard', () => {
  it('binds Cmd+Z / Cmd+Shift+Z to undo / redo', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const apply = vi.fn();
    const u = createUndoManager<CellEdit>({ apply });
    u.push({
      kind: 'cellEdit',
      forward: { kind: 'cellEdit', row: 0, col: 'name', value: 'B' },
      inverse: { kind: 'cellEdit', row: 0, col: 'name', value: 'A' },
    });
    const unbind = u.bindKeyboard(target);
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true }),
    );
    expect(apply).toHaveBeenLastCalledWith({ kind: 'cellEdit', row: 0, col: 'name', value: 'A' });
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'z',
        metaKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(apply).toHaveBeenLastCalledWith({ kind: 'cellEdit', row: 0, col: 'name', value: 'B' });
    unbind();
    document.body.removeChild(target);
  });

  it('does not undo when the keystroke fires inside an editable element', () => {
    const target = document.createElement('div');
    const input = document.createElement('input');
    target.appendChild(input);
    document.body.appendChild(target);
    const apply = vi.fn();
    const u = createUndoManager<CellEdit>({ apply });
    u.push({
      kind: 'cellEdit',
      forward: { kind: 'cellEdit', row: 0, col: 'name', value: 'B' },
      inverse: { kind: 'cellEdit', row: 0, col: 'name', value: 'A' },
    });
    u.bindKeyboard(target);
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true }),
    );
    expect(apply).not.toHaveBeenCalled();
    document.body.removeChild(target);
  });
});
