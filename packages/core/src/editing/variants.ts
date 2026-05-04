// =============================================================================
// Built-in cell editor variants.
//
// Composes onto the validated editor pipeline already in @onegrid/core:
// the grid handles positioning, focus, IME composition, paste, Escape-
// to-cancel, Enter-to-commit, and validator dispatch. Each variant
// just describes how to build + read the input widget.
//
//   createSelectEditor({ options })   — <select> dropdown
//   createDateEditor()                — <input type="date">
//   createTextareaEditor({ rows })    — multi-line <textarea>
//
// Variants are framework-agnostic and DOM-only. Framework adapters can
// wrap their component-per-cell editors using the same CellEditor
// interface (analogous to createReactCellRenderer for renderers).
// =============================================================================

import type { CellEditContext, CellEditor, CellEditorInstance } from '../types';

/**
 * Drop-down editor — <select> with the supplied options. The committed
 * value is the option `value` (or its `label` if no value is supplied).
 */
export function createSelectEditor(config: {
  readonly options: ReadonlyArray<{ readonly value: string; readonly label?: string }>;
  readonly id?: string;
}): CellEditor {
  return {
    id: config.id ?? 'select',
    mount(ctx: CellEditContext): CellEditorInstance {
      const select = document.createElement('select');
      select.style.cssText =
        'box-sizing:border-box;width:100%;height:100%;margin:0;padding:0 6px;' +
        'border:2px solid #6ea8fe;outline:none;background:#0b0d10;color:#e7e9ec;' +
        'font-family:inherit;font-size:inherit;';
      for (const opt of config.options) {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label ?? opt.value;
        select.appendChild(o);
      }
      // Pre-select the cell's current value if it matches an option;
      // otherwise leave on the first option. Type-ahead initialText
      // overrides current value (matches the text-input behavior).
      const initial = ctx.initialText ?? ctx.displayText;
      const match = config.options.find(
        (o) => o.value === initial || o.label === initial,
      );
      if (match) select.value = match.value;
      return {
        element: select,
        getValue: () => select.value,
        focus: () => select.focus(),
      };
    },
  };
}

/**
 * Date editor — <input type="date">. The committed value is the ISO
 * yyyy-mm-dd string the input emits. Callers that need a Date object
 * should parse the result in their onCellEdit handler.
 */
export function createDateEditor(config: { readonly id?: string } = {}): CellEditor {
  return {
    id: config.id ?? 'date',
    mount(ctx: CellEditContext): CellEditorInstance {
      const input = document.createElement('input');
      input.type = 'date';
      input.style.cssText =
        'box-sizing:border-box;width:100%;height:100%;margin:0;padding:0 6px;' +
        'border:2px solid #6ea8fe;outline:none;background:#ffffff;color:#0b0d10;' +
        'font-family:inherit;font-size:inherit;';
      // Try to coerce the cell value into a yyyy-mm-dd string. Accepts
      // ISO datetimes (slices the date portion) and bare yyyy-mm-dd.
      const seed = ctx.initialText ?? ctx.displayText;
      const isoMatch = /^(\d{4}-\d{2}-\d{2})/.exec(seed);
      input.value = isoMatch ? isoMatch[1]! : '';
      return {
        element: input,
        getValue: () => input.value,
        focus: () => input.focus(),
      };
    },
  };
}

/**
 * Textarea editor — multi-line input for long-form content. Enter
 * inserts a newline (instead of committing); commit happens on blur or
 * Cmd/Ctrl+Enter. The grid's keymap is reused with a small twist
 * documented in handleEditorKeyDown.
 */
export function createTextareaEditor(config: {
  readonly rows?: number;
  readonly id?: string;
} = {}): CellEditor {
  const rows = config.rows ?? 4;
  return {
    id: config.id ?? 'textarea',
    mount(ctx: CellEditContext): CellEditorInstance {
      const textarea = document.createElement('textarea');
      textarea.rows = rows;
      textarea.spellcheck = true;
      textarea.style.cssText =
        'box-sizing:border-box;width:100%;margin:0;padding:6px 8px;' +
        'border:2px solid #6ea8fe;outline:none;background:#ffffff;color:#0b0d10;' +
        'font-family:inherit;font-size:inherit;resize:vertical;';
      const initial = ctx.initialText ?? ctx.displayText;
      textarea.value = initial;
      return {
        element: textarea,
        getValue: () => textarea.value,
        focus: () => {
          textarea.focus();
          if (ctx.initialText === undefined) textarea.select();
          else {
            const len = textarea.value.length;
            textarea.setSelectionRange(len, len);
          }
        },
      };
    },
  };
}
