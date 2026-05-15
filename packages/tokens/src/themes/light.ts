// =============================================================================
// @onegrid/tokens/themes/light
//
// Default light theme. Neutral grays with a blue selection accent.
// W3C DTCG 2025.10 shape — each leaf has $type + $value.
// =============================================================================

import type { DtcgBundle, ThemeBundle } from '../index.js';

export const lightDtcg: DtcgBundle = {
  color: {
    $type: 'color',
    background: { $value: '#ffffff' },
    'background-alt': { $value: '#fafafa' },
    text: { $value: '#1f2328' },
    'text-muted': { $value: '#656d76' },
    'text-inverse': { $value: '#ffffff' },
    border: { $value: '#d0d7de' },
    'border-strong': { $value: '#afb8c1' },
    'header-background': { $value: '#f6f8fa' },
    'header-text': { $value: '#1f2328' },
    'pinned-background': { $value: '#f6f8fa' },
    'sticky-background': { $value: '#ffffff' },
    'hover-background': { $value: '#f3f4f6' },
    'selection-background': { $value: '#dbeafe' },
    'selection-text': { $value: '#1f2328' },
    'focus-ring': { $value: '#0969da' },
    'scrollbar-thumb': { $value: '#afb8c1' },
    'scrollbar-track': { $value: '#f6f8fa' },
    chevron: { $value: '#656d76' },
    'detail-panel-background': { $value: '#fafbfc' },
    'status-bar-background': { $value: '#f6f8fa' },
    'status-bar-text': { $value: '#1f2328' },
    'floating-filter-background': { $value: '#ffffff' },
    'tooltip-background': { $value: '#1f2328' },
    'tooltip-text': { $value: '#ffffff' },
    'drag-indicator': { $value: '#0969da' },
    'validation-error': { $value: '#cf222e' },
    'validation-warning': { $value: '#9a6700' },
    'aggregation-background': { $value: '#f6f8fa' },
    'pivot-background': { $value: '#eef2f7' },
    'context-menu-background': { $value: '#ffffff' },
  },
};

export const lightTheme: ThemeBundle = {
  name: 'light',
  dtcg: lightDtcg,
};

export default lightTheme;
