// =============================================================================
// @onegrid/tokens/themes/dark
//
// Default dark theme. Slate backgrounds with a cyan selection accent.
// =============================================================================

import type { DtcgBundle, ThemeBundle } from '../index.js';

export const darkDtcg: DtcgBundle = {
  color: {
    $type: 'color',
    background: { $value: '#0d1117' },
    'background-alt': { $value: '#161b22' },
    text: { $value: '#e6edf3' },
    'text-muted': { $value: '#8b949e' },
    'text-inverse': { $value: '#0d1117' },
    border: { $value: '#30363d' },
    'border-strong': { $value: '#484f58' },
    'header-background': { $value: '#161b22' },
    'header-text': { $value: '#e6edf3' },
    'pinned-background': { $value: '#161b22' },
    'sticky-background': { $value: '#0d1117' },
    'hover-background': { $value: '#1c2128' },
    'selection-background': { $value: '#194869' },
    'selection-text': { $value: '#e6edf3' },
    'focus-ring': { $value: '#1f6feb' },
    'scrollbar-thumb': { $value: '#484f58' },
    'scrollbar-track': { $value: '#161b22' },
    chevron: { $value: '#8b949e' },
    'detail-panel-background': { $value: '#0d1117' },
    'status-bar-background': { $value: '#161b22' },
    'status-bar-text': { $value: '#e6edf3' },
    'floating-filter-background': { $value: '#161b22' },
    'tooltip-background': { $value: '#e6edf3' },
    'tooltip-text': { $value: '#0d1117' },
    'drag-indicator': { $value: '#1f6feb' },
    'validation-error': { $value: '#f85149' },
    'validation-warning': { $value: '#d29922' },
    'aggregation-background': { $value: '#161b22' },
    'pivot-background': { $value: '#1c2128' },
    'context-menu-background': { $value: '#161b22' },
  },
};

export const darkTheme: ThemeBundle = {
  name: 'dark',
  dtcg: darkDtcg,
};

export default darkTheme;
