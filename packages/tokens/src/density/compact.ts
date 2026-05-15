// =============================================================================
// @onegrid/tokens/density/compact
//
// Tight rows for data-heavy screens. 24px row height matches the
// "compact" density convention common in financial / admin tooling.
// =============================================================================

import type { DtcgBundle } from '../index.js';

export const compactDtcg: DtcgBundle = {
  size: {
    $type: 'dimension',
    'row-height': { $value: '24px' },
    'header-height': { $value: '28px' },
    'detail-row-height': { $value: '120px' },
    'font-base': { $value: '12px' },
    'font-header': { $value: '12px' },
    'padding-cell-x': { $value: '6px' },
    'padding-cell-y': { $value: '2px' },
    'border-thickness': { $value: '1px' },
    chevron: { $value: '12px' },
    checkbox: { $value: '14px' },
    'resize-handle': { $value: '4px' },
    'line-height': { $value: '1.2' },
    'touch-hit-zone': { $value: '32px' },
    scrollbar: { $value: '10px' },
    icon: { $value: '14px' },
  },
};

export default compactDtcg;
